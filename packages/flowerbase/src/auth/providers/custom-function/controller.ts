import { ObjectId } from 'bson'
import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG } from '../../../constants'
import { StateManager } from '../../../state'
import { GenerateContext } from '../../../utils/context'
import {
  AUTH_ENDPOINTS,
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
      })

      const currentUserData = {
        _id: new ObjectId(res.id),
        user_data: {
          _id: new ObjectId(res.id),
        }
      }
      if (res.id) {
        return {
          access_token: this.createAccessToken(currentUserData),
          refresh_token: this.createRefreshToken(currentUserData),
          device_id: '',
          user_id: res.id
        }
      }

      throw new Error("Authentication Failed")
    }
  )

}
