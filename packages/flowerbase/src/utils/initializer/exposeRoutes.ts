import { uptime } from 'node:process'
import { FastifyInstance } from 'fastify'
import { RegistrationDto } from '../../auth/providers/local-userpass/dtos'
import { AUTH_ENDPOINTS, REGISTRATION_SCHEMA } from '../../auth/utils'
import { API_VERSION, AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../constants'
import { PROVIDER } from '../../shared/models/handleUserRegistration.model'
import { hashPassword } from '../crypto'

/**
 * > Used to expose all app routes
 * @param fastify -> the fastify instance
 * @tested
 */
export const exposeRoutes = async (fastify: FastifyInstance) => {
  try {
    fastify.get(`${API_VERSION}/app/:appId/location`, async (req) => {
      const schema = DEFAULT_CONFIG?.HTTPS_SCHEMA ?? 'http'
      const headerHost = req.headers.host ?? 'localhost:3000'
      const hostname = headerHost.split(':')[0]
      const port = DEFAULT_CONFIG?.PORT ?? 3000
      const host = port === 8080 ? hostname : `${hostname}:${port}`
      const wsSchema = 'wss'

      return {
        deployment_model: 'LOCAL',
        location: 'IE',
        hostname: `${schema}://${host}`,
        ws_hostname: `${wsSchema}://${host}`
      }
    })

    fastify.get('/health', async () => ({
      status: 'ok',
      uptime: uptime()
    }))

    fastify.post<RegistrationDto>(AUTH_ENDPOINTS.FIRST_USER, {
      schema: REGISTRATION_SCHEMA
    }, async function (req, res) {
      const { authCollection } = AUTH_CONFIG
      const db = fastify.mongo.client.db(DB_NAME)
      const { email, password } = req.body
      const hashedPassword = await hashPassword(password)

      const users = db.collection(authCollection!).find()

      const list = await users?.toArray()

      if (list?.length) {
        res.status(409)
        return {
          error: `The ${authCollection} collection is not empty`
        }
      }

      const result = await db.collection(authCollection!).insertOne({
        email: email,
        password: hashedPassword,
        custom_data: {}
      })

      await db?.collection(authCollection!).updateOne(
        {
          email: email
        },
        {
          $set: {
            identities: [
              {
                id: result?.insertedId.toString(),
                provider_id: result?.insertedId.toString(),
                provider_type: PROVIDER.LOCAL_USERPASS,
                provider_data: { email }
              }
            ]
          }
        }
      )

      res.status(201)
      return {
        userId: result?.insertedId
      }
    })
  } catch (e) {
    console.error('Error while exposing routes', (e as Error).message)
  }
}
