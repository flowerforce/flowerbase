import type { ServerResponse } from 'http'
import { EJSON, ObjectId } from 'bson'
import type { FastifyRequest } from 'fastify'
import type { Document } from 'mongodb'
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

type WatchSubscriber = {
  id: string
  user: Record<string, any>
  response: ServerResponse
  extraFilter?: Document
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

const parseWatchFilter = (args: unknown): Document | undefined => {
  if (!isRecord(args)) return undefined
  const candidate =
    (isRecord(args.filter) ? args.filter : undefined) ??
    (isRecord(args.query) ? args.query : undefined)
  return candidate ? (candidate as Document) : undefined
}

const isReadableDocumentResult = (value: unknown) =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length > 0

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
        query,
        filter,
        update,
        projection,
        options,
        returnNewDocument,
        document,
        documents,
        pipeline = []
      }] = args

      const currentMethod = serviceFn(app, { rules, user })
        .db(database)
        .collection(collection)[method]

      logFunctionCall(`service:${req.body.service}:${method}`, user, args)
      const operatorsByType = await executeQuery({
        currentMethod,
        query,
        filter,
        update,
        projection,
        options,
        returnNewDocument,
        document,
        documents,
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
      if (isReturnedError(result)) {
        res.type('application/json')
        return JSON.stringify({ message: result.message, name: result.name })
      }
      res.type('application/json')
      return serializeEjson(result)
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

    const [{ database, collection, ...watchArgs }] = config.arguments

    const headers = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      "access-control-allow-credentials": "true",
      "access-control-allow-origin": '*',
      "access-control-allow-headers": "X-Stitch-Location, X-Baas-Location, Location",
    };

    res.raw.writeHead(200, headers)
    res.raw.flushHeaders();

    const streamKey = `${database}::${collection}`
    const subscriberId = `${Date.now()}-${watchSubscriberCounter++}`
    const extraFilter = parseWatchFilter(watchArgs)
    const mongoClient = app.mongo.client as unknown as {
      db: (name: string) => { collection: (name: string) => { watch: (...args: any[]) => any } }
    }

    let hub = sharedWatchStreams.get(streamKey)
    if (!hub) {
      const stream = mongoClient.db(database).collection(collection).watch([], {
        fullDocument: 'whenAvailable'
      })
      hub = {
        database,
        collection,
        stream,
        subscribers: new Map<string, WatchSubscriber>()
      }
      sharedWatchStreams.set(streamKey, hub)
    }

    const ensureHubListeners = (currentHub: SharedWatchStream) => {
      if ((currentHub as SharedWatchStream & { listenersBound?: boolean }).listenersBound) {
        return
      }

      const closeHub = async () => {
        currentHub.stream.off('change', onHubChange)
        currentHub.stream.off('error', onHubError)
        sharedWatchStreams.delete(streamKey)
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
            return
          }

          const docId =
            (change as { documentKey?: { _id?: unknown } })?.documentKey?._id ??
            (change as { fullDocument?: { _id?: unknown } })?.fullDocument?._id
          if (typeof docId === 'undefined') return

          const readQuery = subscriber.extraFilter
            ? ({ $and: [subscriber.extraFilter, { _id: docId }] } as Document)
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
      extraFilter
    }
    hub.subscribers.set(subscriberId, subscriber)

    req.raw.on('close', () => {
      const currentHub = sharedWatchStreams.get(streamKey)
      if (!currentHub) return
      currentHub.subscribers.delete(subscriberId)
      if (!currentHub.subscribers.size) {
        void currentHub.stream.close()
        sharedWatchStreams.delete(streamKey)
      }
    })
  })
}
