import type { ServerResponse } from 'http'
import { EJSON, ObjectId } from 'bson'
import type { FastifyRequest } from 'fastify'
import type { Document } from 'mongodb'
import { DEFAULT_CONFIG } from '../../constants'
import { services } from '../../services'
import { GenerateContext } from '../../utils/context'
import { Base64Function, FunctionCallBase64Dto, FunctionCallDto } from './dtos'
import { FunctionController } from './interface'
import { executeQuery } from './utils'

const normalizeUser = (payload: Record<string, any> | undefined) => {
  if (!payload) return undefined
  const nestedUser =
    payload.data ?? payload.user_data ?? payload.custom_data ?? payload
  const flattened =
    typeof nestedUser === 'object' && nestedUser !== null ? nestedUser : {}

  return {
    ...payload,
    ...flattened,
    custom_data: payload.custom_data ?? flattened,
    user_data: payload.user_data ?? flattened,
    data: payload.data ?? flattened
  }
}

const getRequestUser = (req: FastifyRequest) => {
  const candidate = req.user as Record<string, any> | undefined
  return normalizeUser(candidate)
}

const logFunctionCall = (method: string, user: Record<string, any> | undefined, args: unknown[]) => {
  if (process.env.DEBUG_FUNCTIONS !== 'true') return
  console.log('[functions-debug]', method, user ? { id: user.id, role: user.role, email: user.email } : 'no-user', args)
}

const formatFunctionExecutionError = (error: unknown) => {
  const err = error as { message?: string; name?: string }
  const message = typeof err?.message === 'string' ? err.message : String(error)
  const name = typeof err?.name === 'string' ? err.name : 'Error'
  return JSON.stringify({ message, name })
}

const isReturnedError = (value: unknown): value is { message: string; name: string } => {
  if (value instanceof Error) return true
  if (!value || typeof value !== 'object') return false
  const candidate = value as { message?: unknown; name?: unknown }
  return typeof candidate.message === 'string' && typeof candidate.name === 'string'
}

const serializeEjson = (value: unknown) =>
  JSON.stringify(EJSON.serialize(value, { relaxed: false }))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (!isRecord(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const isCursorLike = (
  value: unknown
): value is { toArray: () => Promise<unknown> | unknown } => {
  if (!value || typeof value !== 'object') return false
  return typeof (value as { toArray?: unknown }).toArray === 'function'
}

const normalizeFunctionResult = async (value: unknown) => {
  if (!isCursorLike(value)) return value
  return await value.toArray()
}

type WatchSubscriber = {
  id: string
  user: Record<string, any>
  response: ServerResponse
  documentFilter?: Document
}

type SharedWatchStream = {
  database: string
  collection: string
  stream: {
    on: (event: 'change' | 'error', listener: (payload: any) => void) => void
    off: (event: 'change' | 'error', listener: (payload: any) => void) => void
    close: () => Promise<void> | void
  }
  subscribers: Map<string, WatchSubscriber>
}

const sharedWatchStreams = new Map<string, SharedWatchStream>()
let watchSubscriberCounter = 0
const maxSharedWatchStreams = Number(process.env.MAX_SHARED_WATCH_STREAMS || 200)
const debugWatchStreams = process.env.DEBUG_FUNCTIONS === 'true'

const changeEventRootKeys = new Set([
  '_id',
  'operationType',
  'clusterTime',
  'txnNumber',
  'lsid',
  'ns',
  'documentKey',
  'fullDocument',
  'updateDescription'
])

const isChangeEventPath = (key: string) => {
  if (changeEventRootKeys.has(key)) return true
  return (
    key.startsWith('ns.') ||
    key.startsWith('documentKey.') ||
    key.startsWith('fullDocument.') ||
    key.startsWith('updateDescription.')
  )
}

const isOpaqueChangeEventObjectKey = (key: string) =>
  key === 'ns' || key === 'documentKey' || key === 'fullDocument' || key === 'updateDescription'

export const mapWatchFilterToChangeStreamMatch = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => mapWatchFilterToChangeStreamMatch(item))
  }

  if (!isPlainRecord(value)) return value

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
    if (key.startsWith('$')) {
      acc[key] = mapWatchFilterToChangeStreamMatch(current)
      return acc
    }

    if (isOpaqueChangeEventObjectKey(key)) {
      acc[key] = current
      return acc
    }

    if (isChangeEventPath(key)) {
      acc[key] = mapWatchFilterToChangeStreamMatch(current)
      return acc
    }

    acc[`fullDocument.${key}`] = mapWatchFilterToChangeStreamMatch(current)
    return acc
  }, {})
}

const isLogicalOperator = (key: string) => key === '$and' || key === '$or' || key === '$nor'

export const mapWatchFilterToDocumentQuery = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const mapped = value
      .map((item) => mapWatchFilterToDocumentQuery(item))
      .filter((item) => !(isRecord(item) && Object.keys(item).length === 0))
    return mapped
  }

  if (!isPlainRecord(value)) return value

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
    if (key.startsWith('$')) {
      const mapped = mapWatchFilterToDocumentQuery(current)
      if (isLogicalOperator(key) && Array.isArray(mapped)) {
        if (mapped.length > 0) {
          acc[key] = mapped
        }
        return acc
      }
      if (typeof mapped !== 'undefined') {
        acc[key] = mapped
      }
      return acc
    }

    if (key === 'fullDocument') {
      if (!isPlainRecord(current)) return acc
      const mapped = mapWatchFilterToDocumentQuery(current)
      if (isRecord(mapped)) {
        Object.assign(acc, mapped)
      }
      return acc
    }

    if (key.startsWith('fullDocument.')) {
      const docKey = key.slice('fullDocument.'.length)
      if (!docKey) return acc
      acc[docKey] = mapWatchFilterToDocumentQuery(current)
      return acc
    }

    if (isChangeEventPath(key)) {
      return acc
    }

    acc[key] = mapWatchFilterToDocumentQuery(current)
    return acc
  }, {})
}

const toStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toStableValue(item))
  }
  if (!isPlainRecord(value)) return value

  const sortedEntries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  return sortedEntries.reduce<Record<string, unknown>>((acc, [key, current]) => {
    acc[key] = toStableValue(current)
    return acc
  }, {})
}

const stableSerialize = (value: unknown) => {
  const serialized = EJSON.serialize(value, { relaxed: false })
  return JSON.stringify(toStableValue(serialized))
}

const getWatchPermissionContext = (user: Record<string, any>) => ({
  role: user.role,
  roles: user.roles,
  data: user.data,
  custom_data: user.custom_data,
  user_data: user.user_data
})

const resolveWatchStream = (
  database: string,
  collection: string,
  watchArgs: Record<string, unknown>,
  user: Record<string, any>
) => {
  const keys = Object.keys(watchArgs)
  const hasOnlyAllowedKeys = keys.every((key) => key === 'filter' || key === 'ids')
  if (!hasOnlyAllowedKeys) {
    throw new Error('watch options support only "filter" or "ids"')
  }

  const extraFilter = parseWatchFilter(watchArgs)
  const ids = watchArgs.ids
  if (extraFilter && typeof ids !== 'undefined') {
    throw new Error('watch options cannot include both "ids" and "filter"')
  }

  const pipeline: Document[] = []
  if (extraFilter) {
    pipeline.push({ $match: mapWatchFilterToChangeStreamMatch(extraFilter) as Document })
  }

  if (typeof ids !== 'undefined') {
    if (!Array.isArray(ids)) {
      throw new Error('watch ids must be an array')
    }
    pipeline.push({
      $match: {
        $or: [
          { 'documentKey._id': { $in: ids } },
          { 'fullDocument._id': { $in: ids } }
        ]
      }
    })
  }

  const options = { fullDocument: 'updateLookup' }
  const streamKey = stableSerialize({
    database,
    collection,
    pipeline,
    options,
    permissionContext: getWatchPermissionContext(user)
  })

  return { extraFilter, options, pipeline, streamKey }
}

const getWatchStats = () => {
  let subscribers = 0
  for (const hub of sharedWatchStreams.values()) {
    subscribers += hub.subscribers.size
  }
  return {
    hubs: sharedWatchStreams.size,
    subscribers
  }
}

const logWatchStats = (
  event: string,
  details?: Record<string, unknown>
) => {
  if (!debugWatchStreams) return
  const stats = getWatchStats()
  console.log('[watch-pool]', event, {
    hubs: stats.hubs,
    subscribers: stats.subscribers,
    ...details
  })
}

const parseWatchFilter = (args: unknown): Document | undefined => {
  if (!isRecord(args)) return undefined
  const candidate = isRecord(args.filter) ? args.filter : undefined
  if (!candidate) return undefined
  if ('$match' in candidate) {
    throw new Error('watch filter must be a query object, not a $match stage')
  }
  return candidate as Document
}

const isReadableDocumentResult = (value: unknown) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length > 0

export const shouldSkipReadabilityLookupForChange = (change: Document) =>
  change.operationType === 'delete'

/**
 * > Creates a pre handler for every query
 * @param app -> the fastify instance
 * @param functionsList -> the list of all functions
 * @param rules -> all the rules
 */
export const functionsController: FunctionController = async (
  app,
  { functionsList, rules }
) => {
  app.addHook('preHandler', app.jwtAuthentication)

  app.post<{ Body: FunctionCallDto }>('/call', {
    bodyLimit: DEFAULT_CONFIG.FUNCTION_CALL_BODY_LIMIT_BYTES,
    schema: {
      tags: ['Functions']
    }
  }, async (req, res) => {
    const user = getRequestUser(req)
    if (!user || user.typ !== 'access') {
      throw new Error('Access token required')
    }
    const { name: method, arguments: args } = req.body

    if ('service' in req.body) {
      const serviceFn = services[req.body.service]
      if (req.body.service)
        if (!serviceFn) {
          throw new Error(`Service "${req.body.service}" does not exist`)
        }
      const [{
        database,
        collection,
        key,
        query,
        filter,
        update,
        projection,
        options,
        returnNewDocument,
        document,
        documents,
        operations,
        pipeline = []
      }] = args

      const currentMethod = serviceFn(app, { rules, user })
        .db(database)
        .collection(collection)[method]

      logFunctionCall(`service:${req.body.service}:${method}`, user, args)
      const operatorsByType = await executeQuery({
        currentMethod,
        query,
        key,
        filter,
        update,
        projection,
        options,
        returnNewDocument,
        document,
        documents,
        operations,
        pipeline,
        isClient: true
      })
      const serviceResult = await operatorsByType[method as keyof typeof operatorsByType]()
      res.type('application/json')
      return serializeEjson(serviceResult)
    }

    const currentFunction = functionsList[method]

    if (!currentFunction) {
      throw new Error(`Function "${req.body.name}" does not exist`)
    }

    if (currentFunction.private) {
      throw new Error(`Function "${req.body.name}" is private`)
    }

    logFunctionCall(`function:${method}`, user, args)
    try {
      const result = await GenerateContext({
        args: req.body.arguments,
        app,
        rules,
        user: { ...user, _id: new ObjectId(user.id) },
        currentFunction,
        functionName: String(method),
        functionsList,
        services
      })
      const normalizedResult = await normalizeFunctionResult(result)
      if (isReturnedError(normalizedResult)) {
        res.type('application/json')
        return JSON.stringify({ message: normalizedResult.message, name: normalizedResult.name })
      }
      res.type('application/json')
      return serializeEjson(normalizedResult)
    } catch (error) {
      res.status(400)
      res.type('application/json')
      return JSON.stringify({
        error: formatFunctionExecutionError(error),
        error_code: 'FunctionExecutionError'
      })
    }
  })
  app.get<{
    Querystring: FunctionCallBase64Dto
  }>('/call', {
    schema: {
      tags: ['Functions']
    }
  }, async (req, res) => {
    const { query } = req
    const user = getRequestUser(req)
    if (!user || user.typ !== 'access') {
      throw new Error('Access token required')
    }
    const { baas_request, stitch_request } = query

    const decodedConfig = JSON.parse(
      Buffer.from(baas_request || stitch_request || '', 'base64').toString('utf8')
    )
    const config = EJSON.deserialize(decodedConfig) as Base64Function

    const [{ database, collection, ...watchArgsInput }] = config.arguments
    const watchArgs = isRecord(watchArgsInput) ? watchArgsInput : {}

    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": '*',
      "access-control-allow-headers": "X-Stitch-Location, X-Baas-Location, Location",
    };

    const subscriberId = `${Date.now()}-${watchSubscriberCounter++}`
    const {
      streamKey,
      extraFilter,
      options: watchOptions,
      pipeline: watchPipeline
    } = resolveWatchStream(database, collection, watchArgs, user)

    let hub = sharedWatchStreams.get(streamKey)
    if (!hub) {
      if (sharedWatchStreams.size >= maxSharedWatchStreams) {
        res.status(503)
        return JSON.stringify({
          error: JSON.stringify({
            message: 'Watch stream limit reached',
            name: 'WatchStreamLimitError'
          }),
          error_code: 'WatchStreamLimitError'
        })
      }
      const stream = services['mongodb-atlas'](app, {
        user,
        rules
      })
        .db(database)
        .collection(collection)
        .watch(watchPipeline, watchOptions)
      hub = {
        database,
        collection,
        stream,
        subscribers: new Map<string, WatchSubscriber>()
      }
      sharedWatchStreams.set(streamKey, hub)
      logWatchStats('hub-created', { streamKey, database, collection })
    } else {
      logWatchStats('hub-reused', { streamKey, database, collection })
    }

    res.raw.writeHead(200, headers)
    res.raw.flushHeaders();

    const ensureHubListeners = (currentHub: SharedWatchStream) => {
      if ((currentHub as SharedWatchStream & { listenersBound?: boolean }).listenersBound) {
        return
      }

      const closeHub = async () => {
        currentHub.stream.off('change', onHubChange)
        currentHub.stream.off('error', onHubError)
        sharedWatchStreams.delete(streamKey)
        logWatchStats('hub-closed', { streamKey, database, collection })
        try {
          await currentHub.stream.close()
        } catch {
          // Ignore stream close errors.
        }
      }

      const onHubChange = async (change: Document) => {
        const subscribers = Array.from(currentHub.subscribers.values())
        await Promise.all(subscribers.map(async (subscriber) => {
          const subscriberRes = subscriber.response
          if (subscriberRes.writableEnded || subscriberRes.destroyed) {
            currentHub.subscribers.delete(subscriber.id)
            logWatchStats('subscriber-auto-removed', { streamKey, subscriberId: subscriber.id })
            return
          }

          const docId =
            (change as { documentKey?: { _id?: unknown } })?.documentKey?._id ??
            (change as { fullDocument?: { _id?: unknown } })?.fullDocument?._id
          if (typeof docId === 'undefined') return

          if (shouldSkipReadabilityLookupForChange(change)) {
            subscriberRes.write(`data: ${serializeEjson(change)}\n\n`)
            return
          }

          const readQuery = subscriber.documentFilter
            ? ({ $and: [subscriber.documentFilter, { _id: docId }] } as Document)
            : ({ _id: docId } as Document)

          try {
            const readableDoc = await services['mongodb-atlas'](app, {
              user: subscriber.user,
              rules
            })
              .db(currentHub.database)
              .collection(currentHub.collection)
              .findOne(readQuery)

            if (!isReadableDocumentResult(readableDoc)) return
            subscriberRes.write(`data: ${serializeEjson(change)}\n\n`)
          } catch (error) {
            subscriberRes.write(`event: error\ndata: ${formatFunctionExecutionError(error)}\n\n`)
            subscriberRes.end()
            currentHub.subscribers.delete(subscriber.id)
            logWatchStats('subscriber-error-removed', { streamKey, subscriberId: subscriber.id })
          }
        }))

        if (!currentHub.subscribers.size) {
          await closeHub()
        }
      }

      const onHubError = async (error: unknown) => {
        for (const subscriber of currentHub.subscribers.values()) {
          const subscriberRes = subscriber.response
          if (!subscriberRes.writableEnded && !subscriberRes.destroyed) {
            subscriberRes.write(`event: error\ndata: ${formatFunctionExecutionError(error)}\n\n`)
            subscriberRes.end()
          }
        }
        currentHub.subscribers.clear()
        await closeHub()
      }

      currentHub.stream.on('change', onHubChange)
      currentHub.stream.on('error', onHubError)
        ; (currentHub as SharedWatchStream & { listenersBound?: boolean }).listenersBound = true
    }

    ensureHubListeners(hub)

    const subscriber: WatchSubscriber = {
      id: subscriberId,
      user,
      response: res.raw,
      documentFilter: (() => {
        if (!extraFilter) return undefined
        const mapped = mapWatchFilterToDocumentQuery(extraFilter)
        if (!isRecord(mapped) || Object.keys(mapped).length === 0) return undefined
        return mapped as Document
      })()
    }
    hub.subscribers.set(subscriberId, subscriber)
    logWatchStats('subscriber-added', { streamKey, subscriberId })

    req.raw.on('close', () => {
      const currentHub = sharedWatchStreams.get(streamKey)
      if (!currentHub) return
      currentHub.subscribers.delete(subscriberId)
      logWatchStats('subscriber-closed', { streamKey, subscriberId })
      if (!currentHub.subscribers.size) {
        void currentHub.stream.close()
        sharedWatchStreams.delete(streamKey)
        logWatchStats('hub-empty-closed', { streamKey })
      }
    })
  })
}
