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


export type ALLOWED_METHODS = "GET" | "POST" | "PUT" | "DELETE"

export type CorsConfig = {
  origin: string
  methods: ALLOWED_METHODS[]
}

export type InitializeConfig = {
  projectId: string
  mongodbUrl?: string
  jwtSecret?: string
  port?: number
  host?: string
  corsConfig?: CorsConfig
  basePath?: string
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
  mongodbUrl = DEFAULT_CONFIG.MONGODB_URL,
  corsConfig = DEFAULT_CONFIG.CORS_OPTIONS,
  basePath
}: InitializeConfig) {
  if (!jwtSecret || jwtSecret.trim().length === 0) {
    throw new Error('JWT secret missing: set JWT_SECRET or pass jwtSecret to initialize()')
  }

  const resolvedBasePath = basePath ?? require.main?.path ?? process.cwd()
  const fastify = Fastify({
    logger: !!DEFAULT_CONFIG.ENABLE_LOGGER
  })

  const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined
  const logInfo = (...args: unknown[]) => {
    if (!isTest) {
      console.log(...args)
    }
  }

  logInfo("BASE PATH", resolvedBasePath)
  logInfo("CURRENT PORT", port)
  logInfo("CURRENT HOST", host)

  const functionsList = await loadFunctions(resolvedBasePath)
  logInfo("Functions LOADED")
  const triggersList = await loadTriggers(resolvedBasePath)
  logInfo("Triggers LOADED")
  const endpointsList = await loadEndpoints(resolvedBasePath)
  logInfo("Endpoints LOADED")
  const rulesList = await loadRules(resolvedBasePath)
  logInfo("Rules LOADED")

  const stateConfig = {
    functions: functionsList,
    triggers: triggersList,
    endpoints: endpointsList,
    rules: rulesList,
    projectId,
    app: fastify,
    services
  }

  Object.entries(stateConfig).forEach(([key, value]) =>
    StateManager.setData(key as Parameters<typeof StateManager.setData>[0], value)
  )

  if (DEFAULT_CONFIG.SWAGGER_ENABLED) {
    await fastify.register(import('@fastify/swagger'))

    await fastify.register(import('@fastify/swagger-ui'), {
      routePrefix: '/documentation',
      uiConfig: {
        docExpansion: 'full',
        deepLinking: false
      },
      uiHooks: {
        onRequest: function (request, reply, next) {
          const swaggerUser = DEFAULT_CONFIG.SWAGGER_UI_USER
          const swaggerPassword = DEFAULT_CONFIG.SWAGGER_UI_PASSWORD
          if (!swaggerUser && !swaggerPassword) {
            next()
            return
          }
          const authHeader = request.headers.authorization
          if (!authHeader || !authHeader.startsWith('Basic ')) {
            reply
              .code(401)
              .header('WWW-Authenticate', 'Basic realm="Swagger UI"')
              .send({ message: 'Unauthorized' })
            return
          }
          const encoded = authHeader.slice('Basic '.length)
          const decoded = Buffer.from(encoded, 'base64').toString('utf8')
          const [user, pass] = decoded.split(':')
          if (user !== swaggerUser || pass !== swaggerPassword) {
            reply
              .code(401)
              .header('WWW-Authenticate', 'Basic realm="Swagger UI"')
              .send({ message: 'Unauthorized' })
            return
          }
          next()
        },
        preHandler: function (request, reply, next) { next() }
      },
      staticCSP: true,
      transformStaticCSP: (header) => header,
      transformSpecification: (swaggerObject) => {
        if (!swaggerObject || !swaggerObject.paths) return swaggerObject
        const filteredPaths = { ...swaggerObject.paths }
        Object.keys(filteredPaths).forEach((path) => {
          if (path === '/monit' || path.startsWith('/monit/')) {
            delete filteredPaths[path]
          }
        })
        return { ...swaggerObject, paths: filteredPaths }
      },
      transformSpecificationClone: true
    })
  }

  await registerPlugins({
    register: fastify.register,
    mongodbUrl,
    jwtSecret,
    functionsList,
    corsConfig
  })

  logInfo('Plugins registration COMPLETED')
  await exposeRoutes(fastify)
  logInfo('APP Routes registration COMPLETED')
  await registerFunctions({ app: fastify, functionsList, rulesList })
  logInfo('Functions registration COMPLETED')
  await generateEndpoints({ app: fastify, functionsList, endpointsList, rulesList })
  logInfo('HTTP Endpoints registration COMPLETED')
  fastify.ready(() => {
    logInfo("FASTIFY IS READY")
    activateTriggers({ fastify, triggersList, functionsList })
  })
  await fastify.listen({ port, host })

  fastify.log.info(`[${projectId}] Server listening on port ${port}`)
}
