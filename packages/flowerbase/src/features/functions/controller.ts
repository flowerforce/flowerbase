import { ObjectId } from 'bson'
import type { FastifyRequest } from 'fastify'
import { ChangeStream, Document } from 'mongodb';
import { services } from '../../services'
import { StateManager } from '../../state'
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

  const streams = {} as Record<string, ChangeStream<Document, Document>>

  app.post<{ Body: FunctionCallDto }>('/call', async (req, res) => {
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
        options,
        returnNewDocument,
        document,
        documents,
        pipeline,
        isClient: true
      })
      return operatorsByType[method as keyof typeof operatorsByType]()
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
        functionsList,
        services
      })
      if (isReturnedError(result)) {
        res.type('application/json')
        return JSON.stringify({ message: result.message, name: result.name })
      }
      res.type('application/json')
      return JSON.stringify(result)
    } catch (error) {
      res.status(500)
      res.type('application/json')
      return JSON.stringify({
        error: formatFunctionExecutionError(error),
        error_code: 'FunctionExecutionError'
      })
    }
  })
  app.get<{
    Querystring: FunctionCallBase64Dto
  }>('/call', async (req, res) => {
    const { query } = req
    const user = getRequestUser(req)
    if (!user || user.typ !== 'access') {
      throw new Error('Access token required')
    }
    const { baas_request, stitch_request } = query

    const config: Base64Function = JSON.parse(
      Buffer.from(baas_request || stitch_request || '', 'base64').toString('utf8')
    )

    const [{ database, collection }] = config.arguments
    const app = StateManager.select('app')
    const services = StateManager.select('services')

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

    const requestKey = baas_request || stitch_request

    if (!requestKey) return

    const changeStream = streams[requestKey]

    if (changeStream) {
      changeStream.on('change', (change) => {
        res.raw.write(`data: ${JSON.stringify(change)}\n\n`);
      });

      req.raw.on('close', () => {
        console.log("change stream closed");
        changeStream?.close?.();
        delete streams[requestKey]
      });
      return
    }

    streams[requestKey] = await services['mongodb-atlas'](app, {
      user,
      rules
    })
      .db(database)
      .collection(collection)
      .watch([], { fullDocument: 'whenAvailable' });


    streams[requestKey].on('change', (change) => {
      res.raw.write(`data: ${JSON.stringify(change)}\n\n`);
    });
  })
}
