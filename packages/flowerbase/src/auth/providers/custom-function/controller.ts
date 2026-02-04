import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../../constants'
import { StateManager } from '../../../state'
import { GenerateContext } from '../../../utils/context'
import { hashToken } from '../../../utils/crypto'
import { AUTH_ENDPOINTS } from '../../utils'
import { LoginDto } from './dtos'
import { LOGIN_SCHEMA } from './schema'

/**
 * Controller for handling custom function login.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function customFunctionController(app: FastifyInstance) {

  const functionsList = StateManager.select('functions')
  const services = StateManager.select('services')
  const db = app.mongo.client.db(DB_NAME)
  const { authCollection, refreshTokensCollection } = AUTH_CONFIG
  const refreshTokenTtlMs = DEFAULT_CONFIG.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

  /**
   * Endpoint for user login.
   *
   * @route {POST} /login
   * @param {LoginDto} req - The request object with login data.
   * @returns {Promise<Object>} A promise resolving with access and refresh tokens.
   */
  app.post<LoginDto>(
    AUTH_ENDPOINTS.LOGIN,
    {
      schema: LOGIN_SCHEMA
    },
    async function (req, reply) {
      const customFunctionProvider = AUTH_CONFIG.authProviders?.['custom-function']
      if (!customFunctionProvider || customFunctionProvider.disabled) {
        throw new Error('Custom function authentication disabled')
      }
      const authFunctionName = (customFunctionProvider as { config?: { authFunctionName?: string } })
        .config?.authFunctionName

      if (!authFunctionName || !functionsList[authFunctionName]) {
        throw new Error("Missing Auth Function")
      }

      const {
        ips,
        host,
        hostname,
        url,
        method,
        ip,
        id
      } = req

      type CustomFunctionAuthResult = { id?: string }
      const authResult = await GenerateContext({
        args: [
          req.body
        ],
        app,
        rules: {},
        user: {},
        currentFunction: functionsList[authFunctionName],
        functionName: authFunctionName,
        functionsList,
        services,
        request: {
          ips,
          host,
          hostname,
          url,
          method,
          ip,
          id
        }
      }) as CustomFunctionAuthResult


      if (!authResult.id) {
        reply.code(401).send({ message: 'Unauthorized' })
        return
      }

      const authUser = await db.collection(authCollection!).findOne({ email: authResult.id })
      if (!authUser) {
        reply.code(401).send({ message: 'Unauthorized' })
        return
      }

      const currentUserData = {
        _id: authUser._id,
        user_data: {
          _id: authUser._id
        }
      }
      const refreshToken = this.createRefreshToken(currentUserData)
      const refreshTokenHash = hashToken(refreshToken)
      await db.collection(refreshTokensCollection).insertOne({
        userId: authUser._id,
        tokenHash: refreshTokenHash,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs),
        revokedAt: null
      })
      return {
        access_token: this.createAccessToken(currentUserData),
        refresh_token: refreshToken,
        device_id: '',
        user_id: authUser._id.toString()
      }
    }
  )

}
