import { ObjectId } from 'bson'
import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../constants'
import { hashToken } from '../utils/crypto'
import { SessionCreatedDto } from './dtos'
import { AUTH_ENDPOINTS, AUTH_ERRORS } from './utils'

const HANDLER_TYPE = 'preHandler'

/**
 * Controller for handling user authentication, profile retrieval, and session management.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function authController(app: FastifyInstance) {
  const { authCollection, userCollection, refreshTokensCollection } = AUTH_CONFIG

  const db = app.mongo.client.db(DB_NAME)
  const refreshTokenTtlMs = DEFAULT_CONFIG.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

  try {
    await db.collection(refreshTokensCollection).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    )
  } catch (error) {
    console.error('Failed to ensure refresh token TTL index', error)
  }

  try {
    await db.collection(authCollection).createIndex(
      { email: 1 },
      {
        unique: true
      }
    )
  } catch (error) {
    console.error('Failed to ensure auth email unique index', error)
  }

  app.addHook(HANDLER_TYPE, app.jwtAuthentication)

  /**
   * Endpoint to retrieve the authenticated user's profile.
   *
   * @route {GET} /profile
   * @param {import('fastify').FastifyRequest} req - The request object.
   * @returns {Promise<Object>} A promise resolving with the user's profile data.
   */
  app.get(AUTH_ENDPOINTS.PROFILE, {
    schema: {
      tags: ['Auth']
    }
  }, async function (req) {
    if (req.user.typ !== 'access') {
      throw new Error('Access token required')
    }
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
    {
      schema: {
        tags: ['Auth']
      }
    },
    async function (req, res) {
      if (req.user.typ !== 'refresh') {
        throw new Error(AUTH_ERRORS.INVALID_TOKEN)
      }

      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        throw new Error(AUTH_ERRORS.INVALID_TOKEN)
      }
      const refreshToken = authHeader.slice('Bearer '.length).trim()
      const refreshTokenHash = hashToken(refreshToken)
      const storedToken = await db.collection(refreshTokensCollection).findOne({
        tokenHash: refreshTokenHash,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
      })
      if (!storedToken) {
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
          user_data: {
            ...user,
            id: req.user.sub
          }
        })
      }
    }
  )
  /**
     * Endpoint to destroy the existing session.  
     */
  app.delete(
    AUTH_ENDPOINTS.SESSION,
    {
      schema: {
        tags: ['Auth']
      }
    },
    async function (req, res) {
      const authHeader = req.headers.authorization
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(204)
        return
      }
      const refreshToken = authHeader.slice('Bearer '.length).trim()
      const refreshTokenHash = hashToken(refreshToken)
      const now = new Date()
      const expiresAt = new Date(Date.now() + refreshTokenTtlMs)
      const updateResult = await db.collection(refreshTokensCollection).findOneAndUpdate(
        { tokenHash: refreshTokenHash },
        {
          $set: {
            revokedAt: now,
            expiresAt
          }
        },
        { returnDocument: 'after' }
      )

      const fromToken = req.user?.sub
      let userId = updateResult?.value?.userId
      if (!userId && fromToken) {
        try {
          userId = new ObjectId(fromToken)
        } catch {
          userId = fromToken
        }
      }

      if (userId && authCollection) {
        await db.collection(authCollection).updateOne(
          { _id: userId },
          { $set: { lastLogoutAt: now } }
        )
      }

      return { status: 'ok' }
    }
  )
}
