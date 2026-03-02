import { App } from '../app'
import { Credentials } from '../credentials'
import { MongoDBRealmError } from '../http'

const encodeBase64Url = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const buildJwt = (payload: Record<string, unknown>) => `header.${encodeBase64Url(JSON.stringify(payload))}.signature`

describe('flowerbase-client session', () => {
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

  it('refreshes access token', async () => {
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
        text: async () => JSON.stringify({ access_token: 'access' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-3' })
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-fallback' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const token = await app.currentUser!.refreshAccessToken()
    expect(token).toBe('access-2')
    expect(global.fetch).toHaveBeenLastCalledWith(
      'http://localhost:3000/api/client/v2.0/auth/session',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer refresh' })
      })
    )
  })

  it('clears session when refresh fails', async () => {
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
        text: async () => JSON.stringify({ access_token: 'access' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'Invalid refresh token provided' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    await expect(app.currentUser!.refreshAccessToken()).rejects.toThrow('Invalid refresh token provided')
    expect(app.currentUser).toBeNull()
  })

  it('revokes session on logout', async () => {
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
        text: async () => JSON.stringify({ access_token: 'access' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'ok' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await app.currentUser!.logOut()

    expect(global.fetch).toHaveBeenLastCalledWith(
      'http://localhost:3000/api/client/v2.0/auth/session',
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(app.currentUser).toBeNull()
  })

  it('retries function call after access token 401', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'access',
            refresh_token: 'refresh',
            user_id: 'user-1'
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: 'token expired' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ result: 42 })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const result = await app.currentUser!.functions.sum(40, 2)
    expect(result).toEqual({ result: 42 })
    expect((global.fetch as jest.Mock).mock.calls[3][0]).toBe('http://localhost:3000/api/client/v2.0/auth/session')
  })

  it('tracks users in allUsers and supports switch/remove', async () => {
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
        text: async () => JSON.stringify({ access_token: 'access' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'ok' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    expect(Object.keys(app.allUsers)).toContain('user-1')
    app.switchUser(user)

    await app.removeUser(user)
    expect(app.currentUser).toBeNull()
    expect(Object.keys(app.allUsers)).not.toContain('user-1')
    expect(user.state).toBe('removed')
  })

  it('exposes providerType, customData and identities', async () => {
    const accessToken = buildJwt({ user_data: { plan: 'pro' } })
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: accessToken,
            refresh_token: 'refresh',
            user_id: 'user-1'
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: accessToken })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            data: { email: 'john@doe.com' },
            identities: [{ id: 'identity-1', provider_type: 'local-userpass' }],
            custom_data: { plan: 'pro' }
          })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await user.refreshCustomData()

    expect(user.providerType).toBe('local-userpass')
    expect(user.customData).toEqual({ plan: 'pro' })
    expect(user.identities).toEqual([{ id: 'identity-1', provider_type: 'local-userpass' }])
  })

  it('throws MongoDBRealmError with status metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => JSON.stringify({ error: 'Unauthorized', error_code: 'InvalidSession' })
    }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await expect(app.logIn(Credentials.anonymous())).rejects.toBeInstanceOf(MongoDBRealmError)
  })

  it('orders allUsers as active first then logged-out and persists order', async () => {
    const storage = new Map<string, string>()
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

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          user_id: 'user-1'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1b' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'ok' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          access_token: 'access-2',
          refresh_token: 'refresh-2',
          user_id: 'user-2'
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2b' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user1 = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await user1.logOut()
    const user2 = await app.logIn(Credentials.anonymous())

    expect(app.currentUser?.id).toBe('user-2')
    expect(Object.keys(app.allUsers)).toEqual(['user-2', 'user-1'])
    expect(app.allUsers['user-1']?.state).toBe('logged-out')
    expect(user2.state).toBe('active')

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ access_token: 'access-2c' })
    }) as unknown as typeof fetch

    const appReloaded = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await appReloaded.getProfile().catch(() => undefined)

    expect(Object.keys(appReloaded.allUsers)).toEqual(['user-2', 'user-1'])
    expect(appReloaded.currentUser?.id).toBe('user-2')
  })

  it('switchUser changes active session used by app calls', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a2', refresh_token: 'refresh-2', user_id: 'user-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user1 = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await app.logIn(Credentials.anonymous())

    await app.callFunction('firstCall', [])
    let request = (global.fetch as jest.Mock).mock.calls[4][1]
    expect(request.headers.Authorization).toBe('Bearer access-2')

    app.switchUser(user1)
    await app.callFunction('secondCall', [])
    request = (global.fetch as jest.Mock).mock.calls[5][1]
    expect(request.headers.Authorization).toBe('Bearer access-1')
  })

  it('notifies app listeners on login, switch and logout', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a2', refresh_token: 'refresh-2', user_id: 'user-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'ok' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const appListener = jest.fn()
    app.addListener(appListener)

    const user1 = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await app.logIn(Credentials.anonymous())
    app.switchUser(user1)
    await app.logoutUser()

    expect(appListener).toHaveBeenCalledTimes(4)
  })

  it('notifies user listeners on token refresh and custom data refresh', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ data: {}, custom_data: { x: 1 }, identities: [] })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    const listener = jest.fn()
    user.addListener(listener)

    await user.refreshAccessToken()
    await user.refreshCustomData()

    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('supports removing app and user listeners', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-3' })
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-fallback' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const appListener = jest.fn()
    app.addListener(appListener)
    app.removeListener(appListener)

    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    expect(appListener).not.toHaveBeenCalled()

    const userListener = jest.fn()
    user.addListener(userListener)
    user.removeAllListeners()
    await user.refreshAccessToken()

    expect(userListener).not.toHaveBeenCalled()
  })

  it('emits app listener notifications in deterministic user order', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a2', refresh_token: 'refresh-2', user_id: 'user-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ status: 'ok' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const events: string[] = []
    app.addListener(() => {
      events.push(app.currentUser?.id ?? 'null')
    })

    const user1 = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await app.logIn(Credentials.anonymous())
    app.switchUser(user1)
    await app.logoutUser()

    expect(events).toEqual(['user-1', 'user-2', 'user-1', 'user-2'])
  })

  it('notifies only the target user listener for user-scoped operations', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a2', refresh_token: 'refresh-2', user_id: 'user-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1b' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user1 = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))
    await app.logIn(Credentials.anonymous())

    const user1Listener = jest.fn()
    const user2Listener = jest.fn()
    user1.addListener(user1Listener)
    app.currentUser!.addListener(user2Listener)

    await user1.refreshAccessToken()

    expect(user1Listener).toHaveBeenCalledTimes(1)
    expect(user2Listener).toHaveBeenCalledTimes(0)
  })

  it('continues dispatch when a listener throws', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const badListener = jest.fn(() => {
      throw new Error('listener failure')
    })
    const goodListener = jest.fn()
    app.addListener(badListener)
    app.addListener(goodListener)

    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    expect(badListener).toHaveBeenCalledTimes(1)
    expect(goodListener).toHaveBeenCalledTimes(1)
  })

  it('supports listener removal during dispatch', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation(async () => ({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-fallback' })
      }))
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'login-a1', refresh_token: 'refresh-1', user_id: 'user-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-1' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const onceListener = jest.fn(() => {
      user.removeListener(onceListener)
    })
    const stableListener = jest.fn()
    user.addListener(onceListener)
    user.addListener(stableListener)

    await user.refreshAccessToken()
    await user.refreshAccessToken()

    expect(onceListener).toHaveBeenCalledTimes(1)
    expect(stableListener).toHaveBeenCalledTimes(2)
  })
})
