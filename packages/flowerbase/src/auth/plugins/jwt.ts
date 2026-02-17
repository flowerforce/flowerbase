import fastifyJwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import { Document, ObjectId, WithId } from 'mongodb'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../constants'

type Options = {
  secret: string
}

type JwtAccessWithTimestamp = {
  typ: 'access'
  sub: string
  iat?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const unauthorizedSessionError = {
  message: 'Unauthorized',
  error: 'unauthorized',
  errorCode: 'InvalidSession',
  error_code: 'InvalidSession'
} as const

/**
 * This module is a Fastify plugin that sets up JWT-based authentication and token creation.
 * It registers JWT authentication, and provides methods to create access and refresh tokens.
 * @testable
 * @param {import('fastify').FastifyInstance} fastify - The Fastify instance.
 * @param {Object} opts - Options for the plugin.
 * @param {string} opts.secret - The secret key used for signing JWTs.
 */
export default fp(async function (fastify, opts: Options) {
  const BAAS_ID = new ObjectId().toString()

  fastify.register(fastifyJwt, {
    secret: opts.secret
  })

  fastify.decorate('jwtAuthentication', async function (request, reply) {
    try {
      await request.jwtVerify()
    } catch (err) {
      fastify.log.warn({ err }, 'JWT authentication failed')
      reply.code(401).send(unauthorizedSessionError)
      return
    }

    if (request.user?.typ !== 'access') {
      return
    }

    const db = fastify.mongo?.client?.db(DB_NAME)
    if (!db) {
      fastify.log.warn('Mongo client unavailable while checking logout state')
      return
    }

    if (!request.user.sub) {
      reply.code(401).send(unauthorizedSessionError)
      return
    }

    let authUser
    try {
      authUser = await db
        .collection<Document>(AUTH_CONFIG.authCollection)
        .findOne({ _id: new ObjectId(request.user.sub) })
    } catch (err) {
      fastify.log.warn({ err }, 'Failed to lookup user during JWT authentication')
      reply.code(401).send(unauthorizedSessionError)
      return
    }

    if (!authUser) {
      reply.code(401).send(unauthorizedSessionError)
      return
    }

    const lastLogoutAt = authUser.lastLogoutAt ? new Date(authUser.lastLogoutAt) : null
    const accessUser = request.user as JwtAccessWithTimestamp
    const rawIssuedAt = accessUser.iat
    const issuedAt =
      typeof rawIssuedAt === 'number'
        ? rawIssuedAt
        : typeof rawIssuedAt === 'string'
          ? Number(rawIssuedAt)
          : undefined
    if (
      lastLogoutAt &&
      !Number.isNaN(lastLogoutAt.getTime()) &&
      typeof issuedAt === 'number' &&
      !Number.isNaN(issuedAt) &&
      lastLogoutAt.getTime() >= issuedAt * 1000
    ) {
      reply.code(401).send(unauthorizedSessionError)
      return
    }
  })

  fastify.decorate('createAccessToken', function (user: WithId<Document>) {
    const id = user._id.toString()
    const userData = isRecord(user.user_data) ? { ...user.user_data } : {}
    const customData = isRecord(user.custom_data)
      ? { ...user.custom_data }
      : { ...userData }
    const mergedUserData = {
      ...customData,
      ...userData,
      _id: id,
      id,
      email: typeof user.email === 'string' ? user.email : userData.email
    }

    return this.jwt.sign(
      {
        typ: 'access',
        id,
        data: mergedUserData,
        user_data: mergedUserData,
        custom_data: customData
      },
      {
        iss: BAAS_ID,
        jti: BAAS_ID,
        sub: id,
        expiresIn: '300m'
      }
    )
  })

  fastify.decorate('createRefreshToken', function (user: WithId<Document>) {
    return this.jwt.sign(
      {
        typ: 'refresh',
        baas_id: BAAS_ID
      },
      {
        sub: user._id.toJSON(),
        expiresIn: `${DEFAULT_CONFIG.REFRESH_TOKEN_TTL_DAYS}d`
      }
    )
  })
})
