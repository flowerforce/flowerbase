import { GenerateEndpointsParams } from './interface'
import { createEndpointAuthorization } from './authorization'
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
  const enabledEndpoints = endpointsList
    .filter(({ disabled, function_name }) => !disabled && !!functionsList[function_name])
    .map((endpoint) => ({ endpoint, authorize: createEndpointAuthorization(endpoint) }))

  enabledEndpoints.forEach(({ endpoint, authorize }) => {
    const { http_method, route, function_name } = endpoint
    const currentFunction = functionsList[function_name]

    const handler = generateHandler({
      app,
      rulesList,
      currentFunction,
      functionName: function_name,
      functionsList,
      http_method
    })
    const currentMethod = getMethodsConfig(app, handler, `/app/:appId/endpoint/${route.replace(/^\//, "")}`, authorize)[
      http_method
    ]
    currentMethod()
  })
}
