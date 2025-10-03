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
export * from './model'

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
  host = DEFAULT_CONFIG.HOST,
  jwtSecret = DEFAULT_CONFIG.JWT_SECRET,
  port = DEFAULT_CONFIG.PORT,
  mongodbUrl = DEFAULT_CONFIG.MONGODB_URL
}: InitializeConfig) {
  const fastify = Fastify({
    logger: !!DEFAULT_CONFIG.ENABLE_LOGGER
  })

  const basePath = require.main?.path
  console.log("BASE PATH", basePath)

  console.log("CURRENT PORT", port)
  console.log("CURRENT HOST", host)

  const functionsList = await loadFunctions(basePath)
  console.log("Functions LOADED")
  const triggersList = await loadTriggers(basePath)
  console.log("Triggers LOADED")
  const endpointsList = await loadEndpoints(basePath)
  console.log("Endpoints LOADED")
  const rulesList = await loadRules(basePath)
  console.log("Rules LOADED")

  const stateConfig = {
    functions: functionsList,
    triggers: triggersList,
    endpoints: endpointsList,
    rules: rulesList,
    app: fastify,
    services
  }

  Object.entries(stateConfig).forEach(([key, value]) =>
    StateManager.setData(key as Parameters<typeof StateManager.setData>[0], value)
  )

  await fastify.register(import('@fastify/swagger'))

  await fastify.register(import('@fastify/swagger-ui'), {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    uiHooks: {
      onRequest: function (request, reply, next) { next() },
      preHandler: function (request, reply, next) { next() }
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject,) => { return swaggerObject },
    transformSpecificationClone: true
  })

  await registerPlugins({
    register: fastify.register,
    mongodbUrl,
    jwtSecret,
    functionsList
  })

  console.log('Plugins registration COMPLETED')
  await exposeRoutes(fastify)
  console.log('APP Routes registration COMPLETED')
  await registerFunctions({ app: fastify, functionsList, rulesList })
  console.log('Functions registration COMPLETED')
  await generateEndpoints({ app: fastify, functionsList, endpointsList, rulesList })
  console.log('HTTP Endpoints registration COMPLETED')
  fastify.ready(() => {
    console.log("FASTIFY IS READY")
    if (triggersList?.length > 0) activateTriggers({ fastify, triggersList, functionsList })
  })
  await fastify.listen({ port, host })

  fastify.log.info(`[${projectId}] Server listening on port ${port}`)
}
