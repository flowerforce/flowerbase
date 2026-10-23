import { AggregationCursor, Document } from 'mongodb'
import { Readable } from 'node:stream'
import cloneDeep from 'lodash/cloneDeep'

const stages: Record<string, string> = {
  addFields: '$addFields',
  bucket: '$bucket',
  bucketAuto: '$bucketAuto',
  count: '$count',
  densify: '$densify',
  facet: '$facet',
  fill: '$fill',
  geoNear: '$geoNear',
  graphLookup: '$graphLookup',
  group: '$group',
  limit: '$limit',
  lookup: '$lookup',
  match: '$match',
  out: '$out',
  project: '$project',
  redact: '$redact',
  replaceRoot: '$replaceRoot',
  replaceWith: '$replaceWith',
  sample: '$sample',
  set: '$set',
  setWindowFields: '$setWindowFields',
  skip: '$skip',
  sort: '$sort',
  sortByCount: '$sortByCount',
  unionWith: '$unionWith',
  unset: '$unset',
  unwind: '$unwind'
}
const safeMethods = new Set([
  'next',
  'tryNext',
  'hasNext',
  'toArray',
  'forEach',
  'close',
  'rewind',
  'batchSize',
  'maxTimeMS',
  'comment',
  'allowDiskUse',
  'explain'
])

/** Prevent cursor chaining from adding an unguarded secondary data source. */
export const authorizeAggregate = (
  cursor: AggregationCursor,
  authorizeStages: (pipeline: Document[]) => Document[]
): AggregationCursor => {
  let wrapped: AggregationCursor
  const listeners = new Map<string, Map<Function, Set<(...args: any[]) => void>>>()
  const on = (event: string, listener: (...args: any[]) => void, once = false) => {
    const callback = (...args: any[]) => listener.apply(wrapped, args)
    const events = listeners.get(event) ?? new Map()
    const registered = events.get(listener) ?? new Set()
    registered.add(callback)
    events.set(listener, registered)
    listeners.set(event, events)
    if (once) cursor.once(event, callback)
    else cursor.on(event, callback)
    return wrapped
  }
  const off = (event: string, listener: (...args: any[]) => void) => {
    for (const callback of listeners.get(event)?.get(listener) ?? [])
      cursor.off(event, callback)
    listeners.get(event)?.delete(listener)
    return wrapped
  }
  wrapped = new Proxy(Object.create(null), {
    get: (_target, property) => {
      if (property === 'on' || property === 'addListener') return on
      if (property === 'once')
        return (event: string, listener: (...args: any[]) => void) =>
          on(event, listener, true)
      if (property === 'off' || property === 'removeListener') return off
      if (property === 'removeAllListeners')
        return (event?: string) => {
          if (event === undefined) {
            listeners.clear()
            cursor.removeAllListeners()
          } else {
            listeners.delete(event)
            cursor.removeAllListeners(event)
          }
          return wrapped
        }
      if (property === 'map')
        return (transform: (document: Document) => unknown) => {
          cursor.map((document) => transform.call(wrapped, document))
          return wrapped
        }
      if (property === 'forEach')
        return (callback: (document: Document) => boolean | void) =>
          cursor.forEach((document) => callback.call(wrapped, document))
      if (property === 'clone')
        return () => authorizeAggregate(cursor.clone(), authorizeStages)
      if (property === 'addStage')
        return (stage: Document) => {
          for (const guarded of authorizeStages([stage])) cursor.addStage(guarded)
          return wrapped
        }
      if (typeof property === 'string' && stages[property])
        return (value: unknown) => {
          for (const guarded of authorizeStages([{ [stages[property]]: value }]))
            cursor.addStage(guarded)
          return wrapped
        }
      if (property === Symbol.asyncIterator)
        return cursor[Symbol.asyncIterator].bind(cursor)
      if (property === 'stream')
        return (options?: { transform?: (document: Document) => unknown }) =>
          Readable.from(
            (async function* () {
              for await (const document of wrapped)
                yield options?.transform ? options.transform(document) : document
            })()
          )
      if (typeof property === 'string' && safeMethods.has(property)) {
        const method = (cursor as unknown as Record<string, Function>)[property]
        return (...args: unknown[]) => {
          const result = method.apply(cursor, args)
          return result === cursor ? wrapped : result
        }
      }
      if (
        ['closed', 'killed', 'id', 'namespace', 'readConcern', 'readPreference'].includes(
          String(property)
        )
      ) {
        return cloneDeep(Reflect.get(cursor, property, cursor))
      }
      if (property === 'then') return undefined
      throw new Error(`Aggregation cursor property ${String(property)} is not supported`)
    },
    set: () => {
      throw new Error('Authorized aggregation state cannot be modified directly')
    },
    defineProperty: () => {
      throw new Error('Authorized aggregation state cannot be modified directly')
    }
  })
  return wrapped
}
