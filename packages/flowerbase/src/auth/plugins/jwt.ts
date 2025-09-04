import fastifyJwt from '@fastify/jwt'
import fp from 'fastify-plugin'
import { Document, ObjectId, WithId } from 'mongodb'

type Options = {
  secret: string
}

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
      // TODO: handle error
      reply.send(err)
    }
  })

  fastify.decorate('createAccessToken', function (user: WithId<Document>) {
    const id = user._id.toString()
    const userDataId = user.user_data._id.toString()

    const user_data = {
      _id: userDataId,
      id: userDataId,
      email: user.email,
      ...user.user_data
    }

    return this.jwt.sign(
      {
        typ: 'access',
        id,
        data: user_data,
        user_data: user_data,
        custom_data: user_data
      },
      {
        iss: BAAS_ID,
        jti: BAAS_ID,
        sub: user._id.toJSON(),
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
        expiresIn: '60d'
      }
    )
  })
})
