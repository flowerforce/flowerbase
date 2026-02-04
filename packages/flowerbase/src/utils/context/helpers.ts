import { mongodb } from '@fastify/mongodb'
import * as jwt from 'jsonwebtoken'
import { Arguments } from '../../auth/dtos'
import { Function } from '../../features/functions/interface'
import { GenerateContextDataParams } from './interface'

type JwtUtils = {
  encode: (
    signingMethod: string,
    payload: unknown,
    secret: string | Buffer,
    customHeaderFields?: Record<string, unknown>
  ) => string
  decode: (
    jwtString: string,
    key: string | Buffer,
    returnHeader?: boolean,
    acceptedSigningMethods?: string[]
  ) => unknown
}

const normalizePayload = (payload: unknown) => {
  if (typeof payload !== 'string') return payload
  try {
    return JSON.parse(payload)
  } catch {
    return payload
  }
}

const createJwtUtils = (): JwtUtils => {
  return {
    encode: (signingMethod, payload, secret, customHeaderFields) => {
      if (typeof signingMethod !== 'string' || signingMethod.length === 0) {
        throw new Error('Missing signing method')
      }

      if (typeof secret !== 'string' && !Buffer.isBuffer(secret)) {
        throw new Error('Missing secret')
      }

      if (typeof secret === 'string' && secret.length === 0) {
        throw new Error('Missing secret')
      }

      const options: jwt.SignOptions = {
        algorithm: signingMethod as jwt.Algorithm
      }

      if (customHeaderFields && Object.keys(customHeaderFields).length > 0) {
        options.header = customHeaderFields as unknown as jwt.JwtHeader
      }

      const normalizedPayload = normalizePayload(payload)
      if (
        typeof normalizedPayload !== 'string' &&
        !Buffer.isBuffer(normalizedPayload) &&
        (typeof normalizedPayload !== 'object' || normalizedPayload === null)
      ) {
        throw new Error('Invalid JWT payload')
      }

      return jwt.sign(
        normalizedPayload as jwt.JwtPayload | string | Buffer,
        secret,
        options
      )
    },
    decode: (jwtString, key, returnHeader = false, acceptedSigningMethods) => {
      if (typeof jwtString !== 'string' || jwtString.length === 0) {
        throw new Error('Invalid JWT string')
      }

      if (typeof key !== 'string' && !Buffer.isBuffer(key)) {
        throw new Error('Missing JWT key')
      }

      if (typeof key === 'string' && key.length === 0) {
        throw new Error('Missing JWT key')
      }

      const options: jwt.VerifyOptions = {}

      if (acceptedSigningMethods && acceptedSigningMethods.length > 0) {
        options.algorithms = acceptedSigningMethods as jwt.Algorithm[]
      }

      if (returnHeader) {
        const decoded = jwt.verify(jwtString, key, { ...options, complete: true })
        if (typeof decoded === 'string') return decoded
        const { header, payload } = decoded as jwt.Jwt
        return { header, payload }
      }

      return jwt.verify(jwtString, key, options)
    }
  }
}

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
  functionName,
  functionsList,
  GenerateContext,
  request
}: GenerateContextDataParams) => {
  const BSON = mongodb.BSON
  const Binary = BSON?.Binary as
    | (typeof mongodb.BSON.Binary & {
        fromBase64?: (base64: string, subType?: number) => mongodb.BSON.Binary | Uint8Array
        fromBase64Binary?: (base64: string, subType?: number) => mongodb.BSON.Binary
        __fb_fromBase64Wrapped?: boolean
      })
    | undefined

  if (Binary && typeof Binary.fromBase64 !== 'function') {
    Binary.fromBase64 = (base64: string, subType?: number) => {
      if (typeof Binary.createFromBase64 === 'function') {
        return Binary.createFromBase64(base64, subType)
      }
      return new Binary(Buffer.from(base64, 'base64'), subType)
    }
  }

  if (Binary && Binary.fromBase64 && !Binary.__fb_fromBase64Wrapped) {
    Binary.__fb_fromBase64Wrapped = true
    const fromBase64Binary =
      Binary.fromBase64Binary ??
      (Binary.fromBase64 as (base64: string, subType?: number) => mongodb.BSON.Binary)
    Binary.fromBase64Binary = fromBase64Binary
    Binary.fromBase64 = (base64: string, subType?: number) => {
      const result =
        fromBase64Binary?.(base64, subType) ??
        new Binary(Buffer.from(base64, 'base64'), subType)
      return typeof result.value === 'function' ? result.value() : result
    }
  }

  const getService = (serviceName: keyof typeof services) => {
    try {
      return services[serviceName](app, {
        rules,
        user,
        run_as_system: currentFunction.run_as_system,
        monitoring: functionName ? { invokedFrom: functionName } : undefined
      })
    } catch (error) {
      console.error(
        'Something went wrong while generating context function',
        serviceName,
        error
      )
    }
  }

  const utils = {
    jwt: createJwtUtils()
  }

  return {
    BSON,
    Buffer,
    utils,
    console: {
      log: (...args: Arguments) => {
        console.log(...args)
      },
      error: (...args: Arguments) => {
        console.error(...args)
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
      utils,
      services: {
        get: getService
      },
      http: getService('api'),
      https: getService('api'),
      functions: {
        execute: (name: keyof typeof functionsList, ...args: Arguments) => {
          const currentFunction = functionsList[name] as Function
          return GenerateContext({
            args,
            app,
            rules,
            user,
            currentFunction,
            functionName: String(name),
            functionsList,
            services
          })
        }
      }
    }
  }
}
