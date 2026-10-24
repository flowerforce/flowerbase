import { App } from '../app'
import { Credentials } from '../credentials'

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const jsonResponse = (payload: unknown, status = 200) =>
  ({
    ok: status < 400,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    text: async () => JSON.stringify(payload)
  }) as Response

const queueLogin = (fetchMock: jest.Mock, userId: string, tokenId = userId) => {
  fetchMock.mockResolvedValueOnce(
    jsonResponse({
      user_id: userId,
      access_token: `login-${tokenId}`,
      refresh_token: `refresh-${tokenId}`
    })
  )
  fetchMock.mockResolvedValueOnce(jsonResponse({ access_token: `access-${tokenId}` }))
}

const logIn = (app: App, userId: string) =>
  app.logIn(Credentials.emailPassword(`${userId}@example.invalid`, 'password'))

describe('flowerbase-client session lifecycle', () => {
  const originalFetch = global.fetch
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const appId = 'session-lifecycle'
  let fetchMock: jest.Mock

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  const createApp = () => new App({ id: appId, baseUrl: 'https://backend.invalid' })

  it('retries a direct App call as its original user after switching users', async () => {
    queueLogin(fetchMock, 'alice')
    queueLogin(fetchMock, 'bob')
    const functionStarted = deferred<void>()
    const expiredResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      functionStarted.resolve()
      return expiredResponse.promise
    })
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: 'access-alice-refreshed' })
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ updatedFor: 'alice' }))
    const app = createApp()
    const alice = await logIn(app, 'alice')
    const bob = await logIn(app, 'bob')
    app.switchUser(alice)

    const operation = app.callFunction('updateMyData', [{ value: 'alice-input' }])
    await functionStarted.promise
    app.switchUser(bob)
    expiredResponse.resolve(jsonResponse({ message: 'expired access token' }, 401))

    await expect(operation).resolves.toEqual({ updatedFor: 'alice' })
    expect(fetchMock.mock.calls[4][1].headers.Authorization).toBe('Bearer access-alice')
    expect(fetchMock.mock.calls[5][1].headers.Authorization).toBe('Bearer refresh-alice')
    expect(fetchMock.mock.calls[6][1].headers.Authorization).toBe(
      'Bearer access-alice-refreshed'
    )
    expect(JSON.parse(fetchMock.mock.calls[6][1].body)).toEqual({
      name: 'updateMyData',
      arguments: [{ value: 'alice-input' }]
    })
    expect(app.currentUser).toBe(bob)
    expect(bob.accessToken).toBe('access-bob')
  })

  it('does not restore a session when its pending refresh completes after logout starts', async () => {
    queueLogin(fetchMock, 'alice')
    const refreshStarted = deferred<void>()
    const refreshResponse = deferred<Response>()
    const logoutStarted = deferred<void>()
    const logoutResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      refreshStarted.resolve()
      return refreshResponse.promise
    })
    fetchMock.mockImplementationOnce(() => {
      logoutStarted.resolve()
      return logoutResponse.promise
    })
    const app = createApp()
    const alice = await logIn(app, 'alice')

    const refresh = alice.refreshAccessToken()
    const cancelledRefresh = expect(refresh).rejects.toMatchObject({ name: 'AbortError' })
    await refreshStarted.promise
    const logout = alice.logOut()
    await logoutStarted.promise
    const currentUserDuringLogout = app.currentUser

    refreshResponse.resolve(jsonResponse({ access_token: 'late-access-alice' }))
    logoutResponse.resolve(jsonResponse({ status: 'ok' }))
    await logout
    await cancelledRefresh
    expect(currentUserDuringLogout).toBeNull()
    expect(alice.isLoggedIn).toBe(false)
    expect(app.getSession('alice')).toBeNull()
    expect(app.currentUser).toBeNull()
  })

  it('does not restore a persisted browser session when bootstrap completes after logout', async () => {
    const storage = new Map<string, string>([
      [
        `flowerbase:${appId}:session`,
        JSON.stringify({
          userId: 'alice',
          accessToken: 'old-access-alice',
          refreshToken: 'refresh-alice'
        })
      ]
    ])
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    })
    const bootstrapStarted = deferred<void>()
    const bootstrapResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      bootstrapStarted.resolve()
      return bootstrapResponse.promise
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    const app = createApp()
    const profile = app.getProfile()
    const rejectedProfile = expect(profile).rejects.toThrow('User is not authenticated')

    await bootstrapStarted.promise
    await app.currentUser!.logOut()
    bootstrapResponse.resolve(jsonResponse({ access_token: 'late-bootstrap-access' }))
    await rejectedProfile

    expect(app.currentUser).toBeNull()
    expect(app.getSession('alice')).toBeNull()
    expect(storage.has(`flowerbase:${appId}:session`)).toBe(false)
    expect(storage.has(`flowerbase:${appId}:sessions`)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('caches an in-flight profile for its original user after switching users', async () => {
    queueLogin(fetchMock, 'alice')
    queueLogin(fetchMock, 'bob')
    const profileStarted = deferred<void>()
    const profileResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      profileStarted.resolve()
      return profileResponse.promise
    })
    const app = createApp()
    const alice = await logIn(app, 'alice')
    const bob = await logIn(app, 'bob')
    app.switchUser(alice)

    const profile = app.getProfile()
    await profileStarted.promise
    app.switchUser(bob)
    const aliceProfile = {
      data: { email: 'alice@example.invalid' },
      identities: [{ id: 'alice-identity', provider_type: 'local-userpass' }],
      custom_data: { account: 'alice-account' }
    }
    profileResponse.resolve(jsonResponse(aliceProfile))

    await expect(profile).resolves.toEqual(aliceProfile)
    expect(app.getProfileSnapshot('alice')).toEqual(aliceProfile)
    expect(app.getProfileSnapshot('bob')).toBeUndefined()
    expect(alice.identities).toEqual(aliceProfile.identities)
    expect(bob.identities).toEqual([])
    expect(app.currentUser).toBe(bob)
  })

  it('shares one session request between concurrent refreshes of the same user', async () => {
    queueLogin(fetchMock, 'alice')
    const refreshStarted = deferred<void>()
    const refreshResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      refreshStarted.resolve()
      return refreshResponse.promise
    })
    const app = createApp()
    const alice = await logIn(app, 'alice')

    const firstRefresh = alice.refreshAccessToken()
    const secondRefresh = alice.refreshAccessToken()
    await refreshStarted.promise
    refreshResponse.resolve(jsonResponse({ access_token: 'access-alice-refreshed' }))

    await expect(Promise.all([firstRefresh, secondRefresh])).resolves.toEqual([
      'access-alice-refreshed',
      'access-alice-refreshed'
    ])
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://backend.invalid/api/client/v2.0/auth/session'
    )
    expect(fetchMock.mock.calls[2][1].method).toBe('POST')
    expect(alice.accessToken).toBe('access-alice-refreshed')
  })

  it('keeps a new login active when an older refresh fails for the same user', async () => {
    queueLogin(fetchMock, 'alice', 'alice-old')
    const refreshStarted = deferred<void>()
    const oldRefreshResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      refreshStarted.resolve()
      return oldRefreshResponse.promise
    })
    queueLogin(fetchMock, 'alice', 'alice-new')
    const app = createApp()
    const alice = await logIn(app, 'alice')

    const oldRefresh = alice.refreshAccessToken()
    const rejectedRefresh = expect(oldRefresh).rejects.toMatchObject({
      name: 'AbortError'
    })
    await refreshStarted.promise
    const newLogin = await logIn(app, 'alice')
    oldRefreshResponse.resolve(jsonResponse({ message: 'old refresh rejected' }, 401))
    await rejectedRefresh

    expect(app.currentUser).toBe(newLogin)
    expect(newLogin.isLoggedIn).toBe(true)
    expect(newLogin.accessToken).toBe('access-alice-new')
    expect(newLogin.refreshToken).toBe('refresh-alice-new')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('does not retry an old unauthorized App call using a new login for the same user', async () => {
    queueLogin(fetchMock, 'alice', 'alice-old')
    const functionStarted = deferred<void>()
    const expiredResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      functionStarted.resolve()
      return expiredResponse.promise
    })
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }))
    queueLogin(fetchMock, 'alice', 'alice-new')
    const app = createApp()
    const alice = await logIn(app, 'alice')

    const oldOperation = app.callFunction('updateMyData', [{ value: 'old-login-input' }])
    const cancelledOperation = expect(oldOperation).rejects.toMatchObject({
      name: 'AbortError'
    })
    await functionStarted.promise
    await alice.logOut()
    const newLogin = await logIn(app, 'alice')
    expiredResponse.resolve(jsonResponse({ message: 'expired old access token' }, 401))
    await cancelledOperation

    expect(app.currentUser).toBe(newLogin)
    expect(newLogin.accessToken).toBe('access-alice-new')
    expect(newLogin.refreshToken).toBe('refresh-alice-new')
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it('keeps streaming and its retry bound to the user selected when the stream was created', async () => {
    queueLogin(fetchMock, 'alice')
    queueLogin(fetchMock, 'bob')
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: 'expired access token' }, 401)
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: 'access-alice-refreshed' })
    )
    fetchMock.mockResolvedValueOnce({
      ...jsonResponse({}),
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        }
      })
    })
    const app = createApp()
    const alice = await logIn(app, 'alice')
    const bob = await logIn(app, 'bob')
    app.switchUser(alice)

    const stream = await app.callFunctionStreaming('streamMyData', [])
    app.switchUser(bob)
    const chunks: number[][] = []
    for await (const chunk of stream) {
      chunks.push(Array.from(chunk))
    }

    expect(chunks).toEqual([[1, 2, 3]])
    expect(fetchMock.mock.calls[4][1].headers.Authorization).toBe('Bearer access-alice')
    expect(fetchMock.mock.calls[5][1].headers.Authorization).toBe('Bearer refresh-alice')
    expect(fetchMock.mock.calls[6][1].headers.Authorization).toBe(
      'Bearer access-alice-refreshed'
    )
    expect(app.currentUser).toBe(bob)
    expect(bob.accessToken).toBe('access-bob')
  })

  it('keeps a new login active when an older logout request completes for the same user', async () => {
    queueLogin(fetchMock, 'alice', 'alice-old')
    const logoutStarted = deferred<void>()
    const logoutResponse = deferred<Response>()
    fetchMock.mockImplementationOnce(() => {
      logoutStarted.resolve()
      return logoutResponse.promise
    })
    queueLogin(fetchMock, 'alice', 'alice-new')
    const app = createApp()
    const alice = await logIn(app, 'alice')

    const logout = alice.logOut()
    await logoutStarted.promise
    const newLogin = await logIn(app, 'alice')
    logoutResponse.resolve(jsonResponse({ status: 'ok' }))
    await logout

    expect(app.currentUser).toBe(newLogin)
    expect(newLogin.isLoggedIn).toBe(true)
    expect(newLogin.accessToken).toBe('access-alice-new')
    expect(newLogin.refreshToken).toBe('refresh-alice-new')
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
})
