import { ObjectId } from 'bson'
import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME } from '../constants'
import { SessionCreatedDto } from './dtos'
import { AUTH_ENDPOINTS, AUTH_ERRORS } from './utils'

const HANDLER_TYPE = 'preHandler'

/**
 * Controller for handling user authentication, profile retrieval, and session management.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function authController(app: FastifyInstance) {
  const { authCollection, userCollection } = AUTH_CONFIG

  const db = app.mongo.client.db(DB_NAME)

  app.addHook(HANDLER_TYPE, app.jwtAuthentication)

  /**
   * Endpoint to retrieve the authenticated user's profile.
   *
   * @route {GET} /profile
   * @param {import('fastify').FastifyRequest} req - The request object.
   * @returns {Promise<Object>} A promise resolving with the user's profile data.
   */
  app.get(AUTH_ENDPOINTS.PROFILE, async function (req) {
    const user = await db
      .collection<Record<string, unknown>>(authCollection)
      .findOne({ _id: ObjectId.createFromHexString(req.user.id) })
    return {
      _id: user?._id.toString(),
      identities: user?.identities,
      type: 'normal',
      custom_data: user?.curstom_data,
      data: {
        _id: user?._id.toString(),
        email: user?.email
      }
    }
  })

  /**
   * Endpoint to create a new session and generate a new access token.
   *
   * @route {POST} /session
   * @param {import('fastify').FastifyRequest} req - The request object containing the refresh token.
   * @param {import('fastify').FastifyReply} res - The response object.
   * @returns {Promise<SessionCreatedDto>} A promise resolving with the newly created session data.
   */
  app.post<{ Reply: SessionCreatedDto }>(
    AUTH_ENDPOINTS.SESSION,
    async function (req, res) {
      if (req.user.typ !== 'refresh') {
        throw new Error(AUTH_ERRORS.INVALID_TOKEN)
      }

      const auth_user = await db
        ?.collection(authCollection)
        .findOne({ _id: new this.mongo.ObjectId(req.user.sub) })

      if (!auth_user) {
        throw new Error(`User with ID ${req.user.sub} not found`)
      }

      const user = userCollection && AUTH_CONFIG.user_id_field
        ? (await db!.collection(userCollection).findOne({ [AUTH_CONFIG.user_id_field]: req.user.sub }))
        : {}

      res.status(201)
      return {
        access_token: this.createAccessToken({
          ...auth_user,
          user_data: user
        })
      }
    }
  )
  /**
     * Endpoint to destroy the existing session.  
     */
  app.delete(
    AUTH_ENDPOINTS.SESSION,
    async function () {
      return { status: "ok" }
    }
  )
}
