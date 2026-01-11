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

  console.log("BASE PATH", resolvedBasePath)

  console.log("CURRENT PORT", port)
  console.log("CURRENT HOST", host)

  const functionsList = await loadFunctions(resolvedBasePath)
  console.log("Functions LOADED")
  const triggersList = await loadTriggers(resolvedBasePath)
  console.log("Triggers LOADED")
  const endpointsList = await loadEndpoints(resolvedBasePath)
  console.log("Endpoints LOADED")
  const rulesList = await loadRules(resolvedBasePath)
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
    transformSpecification: (swaggerObject,) => { return swaggerObject },
    transformSpecificationClone: true
  })

  await registerPlugins({
    register: fastify.register,
    mongodbUrl,
    jwtSecret,
    functionsList,
    corsConfig
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
