import { uptime } from 'node:process'
import { FastifyInstance } from 'fastify'
import { RegistrationDto } from '../../auth/providers/local-userpass/dtos'
import { AUTH_ENDPOINTS, REGISTRATION_SCHEMA } from '../../auth/utils'
import { API_VERSION, AUTH_CONFIG, AUTH_DB_NAME, DEFAULT_CONFIG } from '../../constants'
import { PROVIDER } from '../../shared/models/handleUserRegistration.model'
import { hashPassword } from '../crypto'

const parseFirstHeaderValue = (header: string | string[] | undefined): string | undefined => {
  if (!header) return undefined
  const raw = Array.isArray(header) ? header[0] : header
  return raw?.split(',')[0]?.trim() || undefined
}

const parseForwardedHeader = (header: string | undefined): { proto?: string; host?: string } => {
  if (!header) return {}
  const segment = header.split(',')[0]?.trim()
  if (!segment) return {}

  const tokens = segment.split(';').map((item) => item.trim())
  const protoToken = tokens.find((item) => item.toLowerCase().startsWith('proto='))
  const hostToken = tokens.find((item) => item.toLowerCase().startsWith('host='))
  const clean = (value?: string) => value?.replace(/^"|"$/g, '')

  return {
    proto: clean(protoToken?.split('=')[1]),
    host: clean(hostToken?.split('=')[1])
  }
}

const hasExplicitPort = (host: string): boolean => {
  if (/^\[[^\]]+]\:\d+$/.test(host)) return true
  if (/^[^:]+\:\d+$/.test(host)) return true
  return false
}

/**
 * > Used to expose all app routes
 * @param fastify -> the fastify instance
 * @tested
 */
export const exposeRoutes = async (fastify: FastifyInstance) => {
  try {
    fastify.get(`${API_VERSION}/app/:appId/location`, {
      schema: {
        tags: ['System']
      }
    }, async (req) => {
      const forwarded = parseForwardedHeader(parseFirstHeaderValue(req.headers.forwarded))
      const forwardedProto = parseFirstHeaderValue(req.headers['x-forwarded-proto'])
      const forwardedHost = parseFirstHeaderValue(req.headers['x-forwarded-host'])
      const forwardedPort = parseFirstHeaderValue(req.headers['x-forwarded-port'])
      const schema = forwarded.proto ?? forwardedProto ?? DEFAULT_CONFIG?.HTTPS_SCHEMA ?? 'http'
      let host = forwarded.host ?? forwardedHost ?? req.headers.host ?? `localhost:${DEFAULT_CONFIG?.PORT ?? 3000}`

      if (forwardedPort && !hasExplicitPort(host)) {
        host = `${host}:${forwardedPort}`
      }

      const wsSchema = 'wss'

      return {
        deployment_model: 'LOCAL',
        location: 'IE',
        hostname: `${schema}://${host}`,
        ws_hostname: `${wsSchema}://${host}`
      }
    })

    fastify.get('/health', {
      schema: {
        tags: ['System']
      }
    }, async () => ({
      status: 'ok',
      uptime: uptime()
    }))

    fastify.post<RegistrationDto>(AUTH_ENDPOINTS.FIRST_USER, {
      schema: REGISTRATION_SCHEMA
    }, async function (req, res) {
      const { authCollection } = AUTH_CONFIG
      const db = fastify.mongo.client.db(AUTH_DB_NAME)
      const { email, password } = req.body
      const hashedPassword = await hashPassword(password)
      const now = new Date()

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
        status: 'confirmed',
        createdAt: now,
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
