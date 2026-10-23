import { App } from '../app'
import { Credentials } from '../credentials'
import { createStorage } from '../storage'

describe('flowerbase-client storage isolation', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const originalFetch = global.fetch

  beforeEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage')
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage)
    } else {
      Reflect.deleteProperty(globalThis, 'localStorage')
    }
  })

  it('keeps in-memory session values isolated between storage instances', async () => {
    const firstStorage = createStorage()
    const secondStorage = createStorage()
    const sessionKey = 'flowerbase:isolated-app:session'

    firstStorage.setItem(sessionKey, 'first-request-session')

    expect(secondStorage.getItem(sessionKey)).toBeNull()
    expect(await secondStorage.hydrate([sessionKey])).toEqual({ [sessionKey]: null })

    secondStorage.setItem(sessionKey, 'second-request-session')
    expect(firstStorage.getItem(sessionKey)).toBe('first-request-session')
    expect(await firstStorage.hydrate([sessionKey])).toEqual({
      [sessionKey]: 'first-request-session'
    })

    secondStorage.removeItem(sessionKey)
    expect(firstStorage.getItem(sessionKey)).toBe('first-request-session')
  })

  it('keeps a separate server App anonymous after another instance logs in', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            user_id: 'victim',
            access_token: 'victim-access-token',
            refresh_token: 'victim-refresh-token'
          })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'victim-access-token' })
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ privateData: 'victim-only' })
      })
    global.fetch = fetchMock as unknown as typeof fetch
    const config = { id: 'server-request-isolation', baseUrl: 'https://backend.invalid' }
    const authenticatedApp = new App(config)
    await authenticatedApp.logIn(
      Credentials.emailPassword('victim@example.invalid', 'password')
    )

    const anonymousApp = new App(config)

    await expect(anonymousApp.callFunction('getPrivateData', [])).rejects.toThrow(
      'User is not authenticated'
    )
    expect(anonymousApp.currentUser).toBeNull()
    expect(anonymousApp.allUsers).toEqual({})
    expect(authenticatedApp.currentUser?.id).toBe('victim')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('preserves shared persistence through browser localStorage', async () => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key)
      }
    })
    const firstStorage = createStorage()
    const secondStorage = createStorage()
    const sessionKey = 'flowerbase:persisted-app:session'

    firstStorage.setItem(sessionKey, 'persisted-session')

    expect(firstStorage.isPersistent).toBe(true)
    expect(secondStorage.isPersistent).toBe(true)
    expect(secondStorage.getItem(sessionKey)).toBe('persisted-session')
    expect(await secondStorage.hydrate([sessionKey])).toEqual({
      [sessionKey]: 'persisted-session'
    })

    secondStorage.removeItem(sessionKey)
    expect(firstStorage.getItem(sessionKey)).toBeNull()
  })
})
