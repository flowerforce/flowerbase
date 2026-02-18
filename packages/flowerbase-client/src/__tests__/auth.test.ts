import { App } from '../app'
import { Credentials } from '../credentials'

describe('flowerbase-client auth', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('logs in with email/password', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        user_id: 'user-1'
      })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    expect(user.id).toBe('user-1')
    expect(app.currentUser?.id).toBe('user-1')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/login',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('logs in with anonymous provider', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        user_id: 'anon-1'
      })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.anonymous())

    expect(user.id).toBe('anon-1')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/anon-user/login',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('logs in with custom function provider', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        user_id: 'custom-1'
      })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.function({ token: 'abc' }))

    expect(user.id).toBe('custom-1')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/custom-function/login',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('supports register and reset endpoints', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })

    await app.emailPasswordAuth.registerUser({ email: 'john@doe.com', password: 'secret123' })
    await app.emailPasswordAuth.sendResetPasswordEmail('john@doe.com')
    await app.emailPasswordAuth.callResetPasswordFunction('john@doe.com', 'new-secret', 'extra')
    await app.emailPasswordAuth.resetPassword({ token: 't1', tokenId: 't2', password: 'new-secret' })

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/register',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/reset/send',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/reset/call',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/reset',
      expect.objectContaining({ method: 'POST' })
    )
  })
})
