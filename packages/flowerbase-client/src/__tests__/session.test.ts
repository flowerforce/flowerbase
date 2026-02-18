import { App } from '../app'
import { Credentials } from '../credentials'

describe('flowerbase-client session', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
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
})
