import fs from 'fs'
import path from 'node:path'
import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

import { services } from '../../services'

import { GenerateContext } from '../../utils/context'
import { Endpoints, GenerateHandlerParams } from './interface'

/**
 * > Loads the endpoint config json file
 * @testable
 */
export const loadEndpoints = async (rootDir = process.cwd()): Promise<Endpoints> => {
  const endpoints: Endpoints = []
  const folders = ['https_endpoints', 'http_endpoints'] as const

  folders.forEach((endpointsDir) => {
    const endPointsFile = path.join(rootDir, endpointsDir, 'config.json')

    if (fs.existsSync(endPointsFile)) {
      const config: Endpoints<'*'> = JSON.parse(fs.readFileSync(endPointsFile, 'utf-8'))
      const configRemap: Endpoints = config.map(({ http_method, ...endpoint }) => ({
        http_method: http_method === '*' ? 'ALL' : http_method,
        ...endpoint
      }))

      endpoints.push(...configRemap)
    }
  })

  return endpoints
}

/**
 * > Creates an object with a config for all HTTP methods
 * @testable
 * @param app -> the fastify instance
 * @param handler -> the handler function for that route
 * @param endpoint -> the current endpoint
 */
export const getMethodsConfig = (
  app: FastifyInstance,
  handler: ReturnType<typeof generateHandler>,
  endpoint: string
) => ({
  ALL: () => app.all(endpoint, handler),
  GET: () => app.get(endpoint, handler),
  POST: () => app.post(endpoint, handler),
  PUT: () => app.put(endpoint, handler),
  PATCH: () => app.patch(endpoint, handler),
  DELETE: () => app.delete(endpoint, handler)
})

/**
 * > Creates an handler function for a single endpoint
 * @testable
 * @param app -> the fastify instance
 * @param currentFunction -> the name of the function that should be called for that endpoint
 * @param functionsList -> the list of all functions
 */
export const generateHandler = ({
  app,
  currentFunction,
  functionsList,
  rulesList
}: GenerateHandlerParams) => {
  return async (req: FastifyRequest, res: FastifyReply) => {
    try {

      // TODO gestire tramite http_method le args da passare

      const response = await GenerateContext({
        args: [], // TODO passare solo body e query ???
        app,
        rules: rulesList,
        user: req.user,
        currentFunction,
        functionsList,
        services
      })

      return res.send(response)

    } catch (e) {
      console.log(e)
    }

    return {}
  }
}
