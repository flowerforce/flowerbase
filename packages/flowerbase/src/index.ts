import 'dotenv/config'
import Fastify from 'fastify'
import { DEFAULT_CONFIG } from './constants'
import { generateEndpoints } from './features/endpoints'
import { loadEndpoints } from './features/endpoints/utils'
import { registerFunctions } from './features/functions'
import { loadFunctions } from './features/functions/utils'
import { loadRules } from './features/rules/utils'
import { activateTriggers } from './features/triggers'
import { loadTriggers } from './features/triggers/utils'
import { services } from './services'
import { StateManager } from './state'
import { exposeRoutes } from './utils/initializer/exposeRoutes'
import { registerPlugins } from './utils/initializer/registerPlugins'
export * from "./model";

export type InitializeConfig = {
  projectId: string
  mongodbUrl?: string
  jwtSecret?: string
  port?: number
  host?: string
}

/**
 * > Used to initialize fastify app
 * @param projectId -> the project id string
 * @param host -> the host string
 * @param jwtSecret -> connection jwt
 * @param port -> the serve port number
 * @param mongodbUrl -> the database connection string
 */
export async function initialize({
  projectId,
  host,
  jwtSecret = DEFAULT_CONFIG.JWT_SECRET,
  port = DEFAULT_CONFIG.PORT,
  mongodbUrl = DEFAULT_CONFIG.MONGODB_URL
}: InitializeConfig) {
  const fastify = Fastify({
    logger: false
  })


  const functionsList = await loadFunctions()
  console.log("Functions LOADED")
  const triggersList = await loadTriggers()
  console.log("Triggers LOADED")
  const endpointsList = await loadEndpoints()
  console.log("Endpoints LOADED")
  const rulesList = await loadRules()
  console.log("Rules LOADED")
  const stateConfig = {
    functions: functionsList,
    triggers: triggersList,
    endpoints: endpointsList,
    rules: rulesList,
    app: fastify,
    services
  }

  Object.entries(stateConfig).forEach(([key, value]) => StateManager.setData(key as Parameters<typeof StateManager.setData>[0], value))

  await registerPlugins({
    register: fastify.register,
    mongodbUrl,
    jwtSecret,
    functionsList
  })

  console.log("Plugins registration COMPLETED")
  await exposeRoutes(fastify)
  console.log("APP Routes registration COMPLETED")
  await registerFunctions({ app: fastify, functionsList, rulesList })
  console.log("Functions registration COMPLETED")
  await generateEndpoints({ app: fastify, functionsList, endpointsList })
  console.log("HTTP Endpoints registration COMPLETED")
  fastify.ready(() => activateTriggers({ fastify, triggersList, functionsList }))
  await fastify.listen({ port, host })

  fastify.log.info(`[${projectId}] Server listening on port ${port}`)
}
