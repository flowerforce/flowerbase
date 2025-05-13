import { uptime } from 'node:process'
import { FastifyInstance } from 'fastify'
import { API_VERSION, DEFAULT_CONFIG } from '../../constants'

/**
 * > Used to expose all app routes
 * @param fastify -> the fastify instance
 * @tested
 */
export const exposeRoutes = async (fastify: FastifyInstance) => {
  try {
    fastify.get(`${API_VERSION}/app/:appId/location`, async (req) => ({
      deployment_model: 'LOCAL',
      location: 'IE',
      hostname: `${DEFAULT_CONFIG.HTTPS_SCHEMA}://${req.headers.host}`,
      ws_hostname: `${DEFAULT_CONFIG.HTTPS_SCHEMA === 'https' ? 'wss' : 'ws'}://${req.headers.host}`
    }))

    fastify.get('/health', async () => ({
      status: 'ok',
      uptime: uptime()
    }))
  } catch (e) {
    console.error('Error while exposing routes', (e as Error).message)
  }
}
