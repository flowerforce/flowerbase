import { ObjectId } from 'bson'
import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../../constants'
import { PROVIDER } from '../../../shared/models/handleUserRegistration.model'
import { hashToken } from '../../../utils/crypto'
import { AUTH_ENDPOINTS } from '../../utils'
import { LoginDto } from './dtos'

/**
 * Controller for handling anonymous user login.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function anonUserController(app: FastifyInstance) {
  const db = app.mongo.client.db(DB_NAME)
  const { authCollection, refreshTokensCollection } = AUTH_CONFIG
  const refreshTokenTtlMs = DEFAULT_CONFIG.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  const anonUserTtlSeconds = DEFAULT_CONFIG.ANON_USER_TTL_SECONDS

  try {
    await db.collection(authCollection!).createIndex(
      { createdAt: 1 },
      {
        expireAfterSeconds: anonUserTtlSeconds,
        partialFilterExpression: { 'identities.provider_type': PROVIDER.ANON_USER }
      }
    )
  } catch (error) {
    console.error('Failed to ensure anonymous user TTL index', error)
  }

  app.post<LoginDto>(
    AUTH_ENDPOINTS.LOGIN,
    async function () {
      const anonProvider = AUTH_CONFIG.authProviders?.['anon-user']
      if (!anonProvider || anonProvider.disabled) {
        throw new Error('Anonymous authentication disabled')
      }

      const now = new Date()
      const userId = new ObjectId()
      const anonEmail = `anon-${userId.toString()}@users.invalid`
      await db.collection(authCollection!).insertOne({
        _id: userId,
        email: anonEmail,
        status: 'confirmed',
        createdAt: now,
        custom_data: {},
        identities: [
          {
            id: userId.toString(),
            provider_id: userId.toString(),
            provider_type: PROVIDER.ANON_USER,
            provider_data: {}
          }
        ]
      })

      const currentUserData = {
        _id: userId,
        user_data: {}
      }
      const refreshToken = this.createRefreshToken(currentUserData)
      const refreshTokenHash = hashToken(refreshToken)
      await db.collection(refreshTokensCollection).insertOne({
        userId,
        tokenHash: refreshTokenHash,
        createdAt: now,
        expiresAt: new Date(Date.now() + refreshTokenTtlMs),
        revokedAt: null
      })

      return {
        access_token: this.createAccessToken(currentUserData),
        refresh_token: refreshToken,
        device_id: '',
        user_id: userId.toString()
      }
    }
  )
}
