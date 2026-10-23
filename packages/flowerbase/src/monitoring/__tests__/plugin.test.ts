import Fastify, { FastifyInstance } from 'fastify'
import monitoringPlugin from '../plugin'
import { DEFAULT_CONFIG } from '../../constants'
import { StateManager } from '../../state'

jest.mock('../utils', () => ({
  ...jest.requireActual('../utils'),
  isTestEnv: () => false
}))

const authorization = `Basic ${Buffer.from('monitor:monitor-test-password').toString('base64')}`
const routes = [
  '/monit', '/%6donit', '/monit/ui.js', '/%6donit/ui.js',
  '/monit/api/functions', '/%6donit/api/functions',
  '/monit/ws', '/%6donit/ws'
]

describe('monitoring route authorization', () => {
  let app: FastifyInstance
  const originalConfig = { ...DEFAULT_CONFIG }

  beforeEach(() => {
    Object.assign(DEFAULT_CONFIG, {
      MONIT_ENABLED: true,
      MONIT_CAPTURE_CONSOLE: false,
      MONIT_USER: 'monitor',
      MONIT_PASSWORD: 'monitor-test-password',
      MONIT_ALLOWED_IPS: [],
      MONIT_RATE_LIMIT_MAX: 100,
      MONIT_RATE_LIMIT_WINDOW_MS: 60_000
    })
    app = Fastify()
  })

  afterEach(async () => {
    await app.close()
    Object.assign(DEFAULT_CONFIG, originalConfig)
    StateManager.setData('monitoring', {})
  })

  it.each(routes)('requires authentication on registered route %s', async (url) => {
    await app.register(monitoringPlugin)
    const response = await app.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(401)
    expect(response.headers['www-authenticate']).toBe('Basic realm="Flowerbase Monitor"')
  })

  it.each(['/monit/api/functions', '/%6donit/api/functions'])(
    'allows correct credentials on %s', async (url) => {
      await app.register(monitoringPlugin)
      const response = await app.inject({ method: 'GET', url, headers: { authorization } })
      expect(response.statusCode).toBe(200)
      expect(response.json()).toHaveProperty('items')
    }
  )

  it.each(['/monit/api/functions/invoke', '/%6donit/api/functions/invoke'])(
    'blocks unauthenticated administrative POST requests on %s', async (url) => {
      await app.register(monitoringPlugin)
      const response = await app.inject({ method: 'POST', url, payload: { name: 'handler', arguments: [] } })
      expect(response.statusCode).toBe(401)
    }
  )

  it('protects monitor routes registered under a custom prefix', async () => {
    await app.register(monitoringPlugin, { basePath: '/admin' })
    expect((await app.inject('/%61dmin/api/functions')).statusCode).toBe(401)
  })

  it.each(['/monit/api/functions', '/%6donit/api/functions'])(
    'enforces the IP allowlist on %s even with valid credentials', async (url) => {
      DEFAULT_CONFIG.MONIT_ALLOWED_IPS = ['203.0.113.7']
      await app.register(monitoringPlugin)
      const response = await app.inject({ method: 'GET', url, remoteAddress: '203.0.113.8', headers: { authorization } })
      expect(response.statusCode).toBe(403)
      const allowed = await app.inject({ method: 'GET', url, remoteAddress: '203.0.113.7', headers: { authorization } })
      expect(allowed.statusCode).toBe(200)
    }
  )

  it('shares the rate limit across normal and encoded monitor paths', async () => {
    DEFAULT_CONFIG.MONIT_RATE_LIMIT_MAX = 1
    await app.register(monitoringPlugin)
    const first = await app.inject({ method: 'GET', url: '/monit/api/functions', headers: { authorization } })
    const second = await app.inject({ method: 'GET', url: '/%6donit/api/functions', headers: { authorization } })
    expect(first.statusCode).toBe(200)
    expect(second.statusCode).toBe(429)
  })

  it('counts unauthenticated encoded requests in the rate limit', async () => {
    DEFAULT_CONFIG.MONIT_RATE_LIMIT_MAX = 1
    await app.register(monitoringPlugin)
    expect((await app.inject('/%6donit/api/functions')).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/monit/api/functions', headers: { authorization } })).statusCode).toBe(429)
  })

  it.each(['/monit/api/functions', '/%6donit/api/functions'])(
    'fails closed when monitor credentials are missing on %s', async (url) => {
      DEFAULT_CONFIG.MONIT_PASSWORD = ''
      await app.register(monitoringPlugin)
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(503)
    }
  )

  it('keeps the guard scoped to monitor routes', async () => {
    await app.register(monitoringPlugin)
    app.get('/health', async () => ({ ok: true }))
    expect((await app.inject('/health')).statusCode).toBe(200)
  })
})
