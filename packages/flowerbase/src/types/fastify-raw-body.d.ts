import 'fastify'
import type { FastifyJWT } from '@fastify/jwt'
import { Db, MongoClient } from 'mongodb'

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string
    user?: FastifyJWT['user']
  }

  interface FastifyContextConfig {
    rawBody?: boolean
  }

  interface FastifyInstance {
    mongo?: {
      client: MongoClient
      db?: Db
      ObjectId: typeof import('mongodb').ObjectId
    }
  }
}
