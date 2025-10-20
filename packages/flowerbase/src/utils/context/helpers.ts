import { mongodb } from '@fastify/mongodb'
import { Arguments } from '../../auth/dtos'
import { Function } from '../../features/functions/interface'
import { GenerateContextDataParams } from './interface'

/**
 * > Used to generate the current context data
 * @testable
 * @param user -> the current user
 * @param services -> the list of all services
 * @param app -> the fastify instance
 * @param rules -> the rules object
 * @param currentFunction -> the function's name that should be called
 * @param functionsList -> the list of all functions
 */
export const generateContextData = ({
  user,
  services,
  app,
  rules,
  currentFunction,
  functionsList,
  GenerateContext,
  request
}: GenerateContextDataParams) => ({
  BSON: mongodb.BSON,
  console: {
    log: (...args: Arguments) => {
      console.log(...args)
    }
  },
  context: {
    request: {
      ...request,
      remoteIPAddress: request?.ip
    },
    user,
    environment: {
      tag: process.env.NODE_ENV
    },
    values: {
      get: (key: string) => process.env[key]
    },
    services: {
      get: (serviceName: keyof typeof services) => {
        try {
          return services[serviceName](app, {
            rules,
            user,
            run_as_system: currentFunction.run_as_system
          })
        } catch (error) {
          console.error(
            'Something went wrong while generating context function',
            serviceName,
            error
          )
        }
      }
    },
    functions: {
      execute: (name: keyof typeof functionsList, ...args: Arguments) => {
        const currentFunction = functionsList[name] as Function
        return GenerateContext({
          args,
          app,
          rules,
          user,
          currentFunction,
          functionsList,
          services
        })
      }
    },
    Buffer,
    http: services.api(),
    https: services.api()
  }
})
