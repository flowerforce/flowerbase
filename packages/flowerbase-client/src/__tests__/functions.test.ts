import { App } from '../app'
import { Credentials } from '../credentials'

describe('flowerbase-client functions', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('calls dynamic function proxies', async () => {
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
        text: async () => JSON.stringify({ result: 42 })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const result = await app.currentUser!.functions.sum(40, 2)
    expect(result).toEqual({ result: 42 })

    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:3000/api/client/v2.0/app/my-app/functions/call',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access' })
      })
    )
  })

  it('throws function execution errors', async () => {
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
        ok: false,
        status: 400,
        text: async () => JSON.stringify({
          error: '{"message":"boom","name":"Error"}',
          error_code: 'FunctionExecutionError'
        })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    await expect(app.currentUser!.functions.explode()).rejects.toThrow('boom')
  })
})
