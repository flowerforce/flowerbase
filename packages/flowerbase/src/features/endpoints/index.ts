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
  endpointsList,
  rulesList
}: GenerateEndpointsParams) => {
  endpointsList.forEach(({ http_method, route, disabled, function_name }) => {
    const currentFunction = functionsList[function_name]

    if (disabled || !currentFunction) return

    const handler = generateHandler({ app, rulesList, currentFunction, functionsList, http_method })
    const currentMethod = getMethodsConfig(app, handler, `/app/:appId/endpoint/${route.replace(/^\//, "")}`)[
      http_method
    ]
    currentMethod()
  })
}
