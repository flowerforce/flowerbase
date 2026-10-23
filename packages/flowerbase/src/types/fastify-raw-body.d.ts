import 'fastify'
import type { FastifyJWT } from '@fastify/jwt'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string | Buffer
    user?: FastifyJWT['user']
  }

  interface FastifyContextConfig {
    rawBody?: boolean
  }
}
