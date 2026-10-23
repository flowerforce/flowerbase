import cloneDeep from 'lodash/cloneDeep'
import { Document, FindCursor } from 'mongodb'
import { Readable } from 'stream'

const omitted = Symbol('omitted projection value')
type ProjectionNode = { terminal: boolean; children: Map<string, ProjectionNode> }
const node = (): ProjectionNode => ({ terminal: false, children: new Map() })
const plainObject = (value: unknown): value is Document =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

const projectionTree = (projection: Document) => {
  if (!plainObject(projection))
    throw new Error('Only inclusion and exclusion projections are supported')
  const entries = Object.entries(projection)
  if (entries.some(([, value]) => ![0, 1, false, true].includes(value))) {
    throw new Error('Computed projections are not supported for authorized reads')
  }
  const nonId = entries.filter(([path]) => path !== '_id')
  const inclusion =
    nonId.some(([, value]) => Boolean(value)) ||
    (!nonId.length && Boolean(projection._id))
  if (nonId.some(([, value]) => Boolean(value)) && nonId.some(([, value]) => !value)) {
    throw new Error('Cannot mix inclusion and exclusion projections')
  }
  const selected = entries.filter(([, value]) => Boolean(value) === inclusion)
  if (inclusion && !Object.prototype.hasOwnProperty.call(projection, '_id'))
    selected.push(['_id', 1])
  const root = node()
  for (const [path] of selected) {
    let current = root
    for (const part of path.split('.')) {
      if (!part || part.startsWith('$') || /[\[\]]/.test(part) || /^\d+$/.test(part)) {
        throw new Error('Projection path is not supported for authorized reads')
      }
      if (current.terminal) throw new Error('Projection paths conflict')
      if (!current.children.has(part)) current.children.set(part, node())
      current = current.children.get(part)!
    }
    if (current.children.size) throw new Error('Projection paths conflict')
    current.terminal = true
  }
  return { root, inclusion }
}

const applyProjection = (
  value: unknown,
  tree: ProjectionNode,
  inclusion: boolean
): unknown => {
  if (tree.terminal) return inclusion ? cloneDeep(value) : omitted
  if (Array.isArray(value)) {
    return value
      .map((entry) => applyProjection(entry, tree, inclusion))
      .filter((entry) => entry !== omitted)
  }
  if (!plainObject(value)) return inclusion ? omitted : cloneDeep(value)
  const entries: [string, unknown][] = []
  for (const [key, child] of Object.entries(value)) {
    const branch = tree.children.get(key)
    if (!branch) {
      if (!inclusion) entries.push([key, cloneDeep(child)])
      continue
    }
    const projected = applyProjection(child, branch, inclusion)
    if (projected !== omitted) entries.push([key, projected])
  }
  return Object.fromEntries(entries)
}

/** Apply a boolean/0/1 projection only after authorization has removed unreadable data. */
export const projectReadableDocument = (
  document: Document,
  projection?: Document
): Document => {
  if (!projection || !Object.keys(projection).length) return cloneDeep(document)
  const { root, inclusion } = projectionTree(projection)
  return applyProjection(document, root, inclusion) as Document
}

type AuthorizedFindOptions = {
  cursor: FindCursor<Document>
  validateDocument: (document: Document) => Promise<Document | null | undefined>
  scopeQuery: (query: Document) => Document
  scopeProjection?: (projection?: Document) => Document | undefined
  projection?: Document
}

const modifiers = new Set([
  'sort',
  'limit',
  'skip',
  'batchSize',
  'maxTimeMS',
  'maxAwaitTimeMS',
  'hint',
  'collation',
  'comment',
  'allowDiskUse',
  'withReadConcern',
  'withReadPreference',
  'addCursorFlag',
  'min',
  'max'
])

/** Keep the native cursor private: every document consumption must pass through validation. */
export const createAuthorizedFindCursor = ({
  cursor,
  validateDocument,
  scopeQuery,
  scopeProjection,
  projection
}: AuthorizedFindOptions): FindCursor<Document> => {
  let selectedProjection = cloneDeep(
    scopeProjection ? scopeProjection(projection) : projection
  )
  // Reject unsupported projections before any native read starts.
  projectReadableDocument({}, selectedProjection)
  let pending: Document | undefined
  let ended = false
  let initialized = false
  let queue = Promise.resolve()
  const transforms: ((document: any) => any)[] = []
  const target = Object.create(null)
  let proxy: FindCursor<Document>

  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation)
    queue = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
  const assertUninitialized = () => {
    if (initialized) throw new Error('Cursor is already initialized')
  }
  const load = async (tryOnly = false) => {
    initialized = true
    if (pending || ended) return pending
    while (!ended) {
      const document = await (tryOnly ? cursor.tryNext() : cursor.next())
      if (document === null) {
        if (!tryOnly || cursor.closed) ended = true
        return undefined
      }
      const readable = await validateDocument(document)
      if (readable !== null && typeof readable !== 'undefined') {
        pending = projectReadableDocument(readable, selectedProjection)
        return pending
      }
    }
    return undefined
  }
  const next = (tryOnly = false) =>
    exclusive(async () => {
      let document: any = await load(tryOnly)
      pending = undefined
      if (typeof document === 'undefined') return null
      for (const transform of transforms) {
        document = await transform(document)
        if (document === null) throw new Error('Cursor map cannot return null')
      }
      return document
    })
  const close = async (options?: { timeoutMS?: number }) => {
    ended = true
    pending = undefined
    await cursor.close(options)
  }
  const iterator = async function* () {
    try {
      let document
      while ((document = await next()) !== null) yield document
    } finally {
      await close()
    }
  }
  const clone = () => {
    const cloned = createAuthorizedFindCursor({
      cursor: cursor.clone(),
      validateDocument,
      scopeQuery,
      scopeProjection,
      projection: selectedProjection
    })
    for (const transform of transforms) cloned.map(transform)
    return cloned
  }

  const methods: Record<PropertyKey, unknown> = {
    next: () => next(),
    tryNext: () => next(true),
    hasNext: () => exclusive(async () => typeof (await load()) !== 'undefined'),
    toArray: async () => {
      const documents = []
      for await (const document of proxy) documents.push(document)
      return documents
    },
    forEach: async (callback: (document: Document) => unknown) => {
      if (typeof callback !== 'function')
        throw new Error('Cursor forEach requires a callback')
      for await (const document of proxy) if ((await callback(document)) === false) break
    },
    stream: (options?: { transform?: (document: Document) => unknown }) =>
      Readable.from(
        (async function* () {
          for await (const document of proxy)
            yield options?.transform ? options.transform(document) : document
        })(),
        { objectMode: true }
      ),
    map: (transform: (document: Document) => unknown) => {
      assertUninitialized()
      if (typeof transform !== 'function')
        throw new Error('Cursor map requires a callback')
      transforms.push(transform)
      return proxy
    },
    filter: (query: Document) => {
      assertUninitialized()
      cursor.filter(scopeQuery(cloneDeep(query)))
      return proxy
    },
    project: (value: Document) => {
      assertUninitialized()
      const scopedProjection = scopeProjection ? scopeProjection(value) : value
      projectReadableDocument({}, scopedProjection)
      selectedProjection = cloneDeep(scopedProjection)
      return proxy
    },
    clone,
    count: async () => (await clone().toArray()).length,
    rewind: () => {
      cursor.rewind()
      initialized = false
      pending = undefined
      ended = false
    },
    close,
    asyncDispose: close,
    bufferedCount: () => (pending ? 1 : 0),
    [Symbol.asyncIterator]: iterator
  }

  proxy = new Proxy(target, {
    get: (_target, key) => {
      if (Object.prototype.hasOwnProperty.call(methods, key)) return methods[key]
      if (modifiers.has(String(key)))
        return (...args: unknown[]) => {
          assertUninitialized()
          if (key === 'collation' && (args[0] as Document)?.locale !== 'simple') {
            throw new Error('Non-simple collation is not supported for authorized reads')
          }
          Reflect.apply(
            (
              cursor as unknown as Record<
                PropertyKey,
                (...parameters: unknown[]) => unknown
              >
            )[key],
            cursor,
            args
          )
          return proxy
        }
      if (key === 'closed') return ended || cursor.closed
      if (key === 'killed') return cursor.killed
      if (key === 'id') return cloneDeep(cursor.id)
      if (key === Symbol.toStringTag) return 'AuthorizedFindCursor'
      if (key === 'then' || key === 'toJSON' || key === 'inspect') return undefined
      throw new Error(
        `Cursor member ${String(key)} is not available for authorized reads`
      )
    },
    set: () => {
      throw new Error('Authorized cursor state cannot be modified directly')
    },
    defineProperty: () => {
      throw new Error('Authorized cursor state cannot be modified directly')
    }
  }) as FindCursor<Document>
  return proxy
}
