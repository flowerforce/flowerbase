import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../../constants'
import { hashToken } from '../../../utils/crypto'
import { PROVIDER } from '../../../shared/models/handleUserRegistration.model'
import { AUTH_ENDPOINTS } from '../../utils'
import { LoginDto } from './dtos'

/**
 * Controller for handling anonymous user login.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function anonUserController(app: FastifyInstance) {
  const db = app.mongo.client.db(DB_NAME)
  const { authCollection, refreshTokensCollection, providers } = AUTH_CONFIG
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
      const anonProvider = providers?.['anon-user']
      if (anonProvider?.disabled) {
        throw new Error('Anonymous authentication disabled')
      }

      const now = new Date()
      const insertResult = await db.collection(authCollection!).insertOne({
        status: 'confirmed',
        createdAt: now,
        custom_data: {},
        identities: [
          {
            provider_type: PROVIDER.ANON_USER,
            provider_data: {}
          }
        ]
      })

      const userId = insertResult.insertedId
      await db.collection(authCollection!).updateOne(
        { _id: userId },
        {
          $set: {
            identities: [
              {
                id: userId.toString(),
                provider_id: userId.toString(),
                provider_type: PROVIDER.ANON_USER,
                provider_data: {}
              }
            ]
          }
        }
      )

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
