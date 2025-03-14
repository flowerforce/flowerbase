import { uptime } from 'node:process'
import { FastifyInstance } from 'fastify'
import { API_VERSION } from '../../constants'

/**
 * > Used to expose all app routes
 * @param fastify -> the fastify instance
 * @tested
 */
export const exposeRoutes = async (fastify: FastifyInstance) => {
  try {
    fastify.get(`${API_VERSION}/app/:appId/location`, async () => ({
      deployment_model: 'LOCAL',
      location: 'IE',
      //TODO -> use referrer
      hostname: 'http://localhost:3000',
      ws_hostname: 'wss://localhost:3000'
    }))

    fastify.get('/health', async () => ({
      status: 'ok',
      uptime: uptime()
    }))
  } catch (e) {
    console.error('Error while exposing routes', (e as Error).message)
  }
}
