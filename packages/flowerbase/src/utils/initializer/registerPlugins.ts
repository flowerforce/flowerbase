import cors from '@fastify/cors'
import fastifyMongodb from '@fastify/mongodb'
import { FastifyInstance } from 'fastify'
import fastifyRawBody from 'fastify-raw-body'
import { CorsConfig } from '../../'
import { authController } from '../../auth/controller'
import jwtAuthPlugin from '../../auth/plugins/jwt'
import { customFunctionController } from '../../auth/providers/custom-function/controller'
import { localUserPassController } from '../../auth/providers/local-userpass/controller'
import { API_VERSION } from '../../constants'
import { Functions } from '../../features/functions/interface'

type RegisterFunction = FastifyInstance['register']
type RegisterParameters = Parameters<RegisterFunction>

type RegisterPluginsParams = {
  register: RegisterFunction
  mongodbUrl: string
  jwtSecret: string
  functionsList: Functions
  corsConfig?: CorsConfig
  databaseName?: string
}

type RegisterConfig = {
  pluginName: string
  plugin: RegisterParameters[0]
  options: RegisterParameters[1]
}

/**
 * > Used to register all plugins
 * @param register -> the fastify register method
 * @param mongodbUrl -> the database connection string
 * @param jwtSecret -> connection jwt
 * @tested
 */
export const registerPlugins = async ({
  register,
  mongodbUrl,
  jwtSecret,
  functionsList,
  corsConfig,
  databaseName
}: RegisterPluginsParams) => {
  try {
    const registersConfig = await getRegisterConfig({
      mongodbUrl,
      jwtSecret,
      corsConfig,
      functionsList,
      databaseName
    })

    registersConfig.forEach(({ plugin, options, pluginName }) => {
      try {
        register(plugin, options)
        console.log('registration COMPLETED --->', pluginName)
      } catch (e) {
        console.log('Registration FAILED --->', pluginName)
        console.log('Error --->', e)
      }
    })
  } catch (e) {
    console.error('Error while registering plugins', (e as Error).message)
  }
}

/**
 * > Used to generate the register config
 * @param mongodbUrl -> the database connection string
 * @param jwtSecret -> connection jwt
 * @testable
 */
const getRegisterConfig = async ({
  mongodbUrl,
  jwtSecret,
  corsConfig,
  databaseName
}: Pick<
  RegisterPluginsParams,
  'jwtSecret' | 'mongodbUrl' | 'functionsList' | 'corsConfig' | 'databaseName'
>): Promise<RegisterConfig[]> => {
  return [
    {
      pluginName: 'cors',
      plugin: cors,
      options: corsConfig
    },
    {
      pluginName: 'fastifyMongodb',
      plugin: fastifyMongodb,
      options: {
        forceClose: true,
        url: mongodbUrl
      }
    },
    {
      pluginName: 'jwtAuthPlugin',
      plugin: jwtAuthPlugin,
      options: {
        secret: jwtSecret
      }
    },
    {
      pluginName: 'fastifyRawBody',
      plugin: fastifyRawBody,
      options: {
        field: 'rawBody',
        global: false,
        encoding: 'utf8',
        runFirst: true,
        routes: [],
        jsonContentTypes: []
      }
    },
    {
      pluginName: 'authController',
      plugin: authController,
      options: { prefix: `${API_VERSION}/auth`, databaseName }
    },
    {
      pluginName: 'localUserPassController',
      plugin: localUserPassController,
      options: {
        prefix: `${API_VERSION}/app/:appId/auth/providers/local-userpass`,
        databaseName
      }
    },
    {
      pluginName: 'customFunctionController',
      plugin: customFunctionController,
      options: {
        prefix: `${API_VERSION}/app/:appId/auth/providers/custom-function`
      }
    }
  ] as RegisterConfig[]
}
