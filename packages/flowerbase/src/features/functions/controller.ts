import { ObjectId } from 'bson'

import { services } from '../../services'
import { StateManager } from '../../state'
import { GenerateContext } from '../../utils/context'
import { Base64Function, FunctionCallBase64Dto, FunctionCallDto } from './dtos'
import { FunctionController } from './interface'
import { executeQuery } from './utils'

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

  app.post<{ Body: FunctionCallDto }>('/call', async (req, res) => {
    const { user } = req
    const { name: method, arguments: args } = req.body

    if ('service' in req.body) {
      const serviceFn = services[req.body.service]
      if (!serviceFn) {
        throw new Error(`Service "${req.body.service}" does not exist`)
      }
      const [{ database, collection, query, update, document, documents }] = args

      const currentMethod = serviceFn(app, { rules, user })
        .db(database)
        .collection(collection)[method]

      const operatorsByType = await executeQuery({
        currentMethod,
        query,
        update,
        document,
        documents
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

    const result = await GenerateContext({
      args: req.body.arguments,
      app,
      rules,
      user: { ...user, _id: new ObjectId(user.id) },
      currentFunction,
      functionsList,
      services
    })
    res.type('application/json')
    return JSON.stringify(result)
  })
  app.get<{
    Querystring: FunctionCallBase64Dto
  }>('/call', async (req, res) => {
    const { query, user } = req
    const { baas_request, stitch_request } = query

    const config: Base64Function = JSON.parse(
      Buffer.from(baas_request || stitch_request || '', 'base64').toString('utf8')
    )
    const [{ database, collection }] = config.arguments
    const app = StateManager.select('app')
    const services = StateManager.select('services')

    const changeStream = await services['mongodb-atlas'](app, {
      user,
      rules
    })
      .db(database)
      .collection(collection)
      .watch([], { fullDocument: 'whenAvailable' })

    res.header('Content-Type', 'text/event-stream')
    res.header('Cache-Control', 'no-cache')
    res.header('Connection', 'keep-alive')
    res.raw.flushHeaders()

    changeStream.on('change', (change) => {
      res.raw.write(`data: ${JSON.stringify(change)}\n\n`)
    })

    req.raw.on('close', () => {
      changeStream.close()
    })
  })
}
