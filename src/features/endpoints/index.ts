import { GenerateEndpointsParams } from './interface'
import { generateHandler, getMethodsConfig } from './utils'

/**
 * > Generates all HTTP endpoints
 * @testable
 * @param app -> the fastify instance
 * @param functionsList -> the list of all functions
 * @param endpointsList -> the list of all endpoints
 */
export const generateEndpoints = async ({
  app,
  functionsList,
  endpointsList
}: GenerateEndpointsParams) => {
  endpointsList.forEach(({ http_method, route, disabled, function_name }) => {
    const currentFunction = functionsList[function_name]

    if (disabled || !currentFunction) return

    const handler = generateHandler({ app, currentFunction, functionsList })
    const currentMethod = getMethodsConfig(app, handler, `/app/:appId/endpoint/${route}`)[
      http_method
    ]
    currentMethod()
  })
}
