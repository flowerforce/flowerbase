import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../../constants'
import handleUserRegistration from '../../../shared/handleUserRegistration'
import { PROVIDER } from '../../../shared/models/handleUserRegistration.model'
import { StateManager } from '../../../state'
import { GenerateContext } from '../../../utils/context'
import { hashToken } from '../../../utils/crypto'
import {
  AUTH_ENDPOINTS,
  generatePassword,
} from '../../utils'
import {
  LoginDto
} from './dtos'
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
  const { refreshTokensCollection } = AUTH_CONFIG
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
    async function (req) {
      const { providers } = AUTH_CONFIG
      const authFunctionName = providers["custom-function"].authFunctionName

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
      const res = await GenerateContext({
        args: [
          req.body
        ],
        app,
        rules: {},
        user: {},
        currentFunction: functionsList[authFunctionName],
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


      if (res.id) {
        const user = await handleUserRegistration(app, { run_as_system: true, skipUserCheck: true, provider: PROVIDER.CUSTOM_FUNCTION })({ email: res.id, password: generatePassword() })
        if (!user?.insertedId) {
          throw new Error('Failed to register custom user')
        }

        const currentUserData = {
          _id: user.insertedId,
          user_data: {
            _id: user.insertedId
          }
        }
        const refreshToken = this.createRefreshToken(currentUserData)
        const refreshTokenHash = hashToken(refreshToken)
        await db.collection(refreshTokensCollection).insertOne({
          userId: user.insertedId,
          tokenHash: refreshTokenHash,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + refreshTokenTtlMs),
          revokedAt: null
        })
        return {
          access_token: this.createAccessToken(currentUserData),
          refresh_token: refreshToken,
          device_id: '',
          user_id: user.insertedId.toString()
        }
      }

      throw new Error("Authentication Failed")
    }
  )

}
