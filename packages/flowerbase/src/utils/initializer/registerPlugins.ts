import cors from '@fastify/cors'
import fastifyMongodb from '@fastify/mongodb'
import { FastifyInstance } from 'fastify'
import { authController } from '../../auth/controller'
import jwtAuthPlugin from '../../auth/plugins/jwt'
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
  functionsList
}: RegisterPluginsParams) => {
  try {
    const registersConfig = await getRegisterConfig({
      mongodbUrl,
      jwtSecret,
      functionsList
    })

    registersConfig.forEach(({ plugin, options, pluginName }) => {
      try {
        register(plugin, options)
        console.log("registration COMPLETED --->", pluginName)
      }
      catch (e) {
        console.log("Registration FAILED --->", pluginName)
        console.log("Error --->", e)
      }

    })
  } catch (e) {
    console.error('Error while registering plugins', (e as Error).message)
  }
}

/**
 * > Used to generate the register congig
 * @param mongodbUrl -> the database connection string
 * @param jwtSecret -> connection jwt
 * @testable  
 */
const getRegisterConfig = async ({
  mongodbUrl,
  jwtSecret
}: Pick<RegisterPluginsParams, 'jwtSecret' | 'mongodbUrl' | 'functionsList'>): Promise<
  RegisterConfig[]
> => {
  return [
    {
      pluginName: "cors",
      plugin: cors,
      options: {
        origin: '*',
        methods: ['POST', 'GET']
      }
    },
    {
      pluginName: "fastifyMongodb",
      plugin: fastifyMongodb,
      options: {
        forceClose: true,
        url: mongodbUrl
      }
    },
    {
      pluginName: "jwtAuthPlugin",
      plugin: jwtAuthPlugin,
      options: {
        secret: jwtSecret
      }
    },
    {
      pluginName: "authController",
      plugin: authController,
      options: { prefix: `${API_VERSION}/auth` }
    },
    {
      pluginName: "localUserPassController",
      plugin: localUserPassController,
      options: {
        prefix: `${API_VERSION}/app/:appId/auth/providers/local-userpass`
      }
    }
  ] as RegisterConfig[]
}
