import { App } from '../app'
import { Credentials } from '../credentials'

describe('flowerbase-client auth', () => {
  const originalFetch = global.fetch
  const originalLocalStorage = (globalThis as typeof globalThis & { localStorage?: unknown }).localStorage

  afterEach(() => {
    global.fetch = originalFetch
    if (typeof originalLocalStorage === 'undefined') {
      Reflect.deleteProperty(globalThis, 'localStorage')
    } else {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: originalLocalStorage
      })
    }
  })

  it('logs in with email/password', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          user_id: 'user-1'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-from-session' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    expect(user.id).toBe('user-1')
    expect(app.currentUser?.id).toBe('user-1')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/login',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/auth/session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer refresh' })
      })
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

  it('logs in with custom jwt provider', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({
        access_token: 'access',
        refresh_token: 'refresh',
        user_id: 'jwt-1'
      })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.jwt('jwt-token'))

    expect(user.id).toBe('jwt-1')
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/custom-token/login',
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

  it('supports email/password confirmation endpoints', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ status: 'ok' })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })

    await app.emailPasswordAuth.confirmUser({ token: 't1', tokenId: 'tid1' })
    await app.emailPasswordAuth.resendConfirmationEmail({ email: 'john@doe.com' })
    await app.emailPasswordAuth.retryCustomConfirmation({ email: 'john@doe.com' })

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/confirm',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/confirm/send',
      expect.objectContaining({ method: 'POST' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      'http://localhost:3000/api/client/v2.0/app/my-app/auth/providers/local-userpass/confirm/call',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('calls session endpoint on app load when browser session exists', async () => {
    const storage = new Map<string, string>()
    storage.set(
      'flowerbase:my-app:session',
      JSON.stringify({ accessToken: 'old-access', refreshToken: 'refresh', userId: 'user-1' })
    )
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        }
      }
    })

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ access_token: 'fresh-access' })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.getProfile().catch(() => undefined)

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/client/v2.0/auth/session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer refresh' })
      })
    )
  })
})
