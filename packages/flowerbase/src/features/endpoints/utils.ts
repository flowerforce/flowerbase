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
      const configRemap: Endpoints = config.map((endpoint) => {
        const { http_method, httpMethod, ...rest } = endpoint as typeof endpoint & {
          httpMethod?: string
        }
        const normalizedMethod = (http_method ?? httpMethod) as string | undefined

        return {
          http_method:
            normalizedMethod === '*' || normalizedMethod === 'ALL' || normalizedMethod === 'ANY'
              ? 'ALL'
              : !normalizedMethod
                ? 'POST'
                : (normalizedMethod as Endpoints[number]['http_method']),
          ...rest
        }
      })

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
  ALL: () => app.all(endpoint, {
    config: {
      rawBody: true
    },
  }, handler),
  GET: () => app.get(endpoint, {
    config: {
      rawBody: true
    },
  }, handler),
  POST: () => app.post(endpoint, {
    config: {
      rawBody: true
    },
  }, handler),
  PUT: () => app.put(endpoint, {
    config: {
      rawBody: true
    },
  }, handler),
  PATCH: () => app.patch(endpoint, {
    config: {
      rawBody: true
    },
  }, handler),
  DELETE: () => app.delete(endpoint, {
    config: {
      rawBody: true
    },
  }, handler)
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
    const { body: originalBody, headers, query, rawBody } = req

    const customBody = {
      text: () => JSON.stringify(originalBody),
      rawBody
    }

    const customResponseBody: {
      data: unknown
    } = {
      data: null
    }
    try {
      const customResponse = {
        setStatusCode: (code: number) => {
          res.status(code)
        },
        setBody: (body: unknown) => {
          customResponseBody.data = body
        }
      }

      const response = await GenerateContext({
        args: [
          { body: customBody, headers, query: JSON.parse(JSON.stringify(query)) },
          customResponse
        ],
        app,
        rules: rulesList,
        user: req.user,
        currentFunction,
        functionsList,
        services,
        deserializeArgs: false
      })

      return res.send(customResponseBody.data ?? response)
    } catch (e) {
      console.log(e)
    }

    return {}
  }
}
