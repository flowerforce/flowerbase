import { App } from '../app'
import { Credentials } from '../credentials'
import { FlowerbaseHttpError } from '../http'

describe('flowerbase-client functions', () => {
  const originalFetch = global.fetch
  const streamFromChunks = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      }
    })

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
        text: async () => JSON.stringify({ access_token: 'access' })
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
      3,
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
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access' })
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

  it('supports functions.callFunction compatibility helper', async () => {
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
        text: async () => JSON.stringify({ result: 7 })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const result = await app.currentUser!.functions.callFunction('sum', 3, 4)
    expect(result).toEqual({ result: 7 })
  })

  it('supports functions.callFunctionStreaming', async () => {
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
        body: streamFromChunks(['a', 'b'])
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const stream = await app.currentUser!.functions.callFunctionStreaming('streamData')
    const received: string[] = []
    for await (const chunk of stream) {
      received.push(new TextDecoder().decode(chunk))
    }

    expect(received).toEqual(['a', 'b'])
  })

  it('executes user-bound functions with that user session', async () => {
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

    await user1.functions.sum(1, 2)
    const request = (global.fetch as jest.Mock).mock.calls[4][1]
    expect(request.headers.Authorization).toBe('Bearer access-1')
  })

  it('retries streaming call when initial request returns 401', async () => {
    const streamFromChunks = (chunks: string[]) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk))
          }
          controller.close()
        }
      })

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
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: 'Unauthorized', error_code: 'InvalidSession' })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        body: streamFromChunks(['x', 'y'])
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const stream = await app.currentUser!.functions.callFunctionStreaming('streamData')
    const received: string[] = []
    for await (const chunk of stream) {
      received.push(new TextDecoder().decode(chunk))
    }

    expect(received).toEqual(['x', 'y'])
    expect((global.fetch as jest.Mock).mock.calls[3][0]).toBe('http://localhost:3000/api/client/v2.0/auth/session')
  })

  it('retries streaming call when stream fails with 401 during iteration', async () => {
    const streamWithAuthError = () =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('a'))
          controller.error(
            new FlowerbaseHttpError({
              method: 'POST',
              url: 'http://localhost:3000/api/client/v2.0/app/my-app/functions/call',
              statusCode: 401,
              statusText: 'Unauthorized',
              error: 'Expired token'
            })
          )
        }
      })

    const streamFromChunks = (chunks: string[]) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(new TextEncoder().encode(chunk))
          }
          controller.close()
        }
      })

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
        body: streamWithAuthError()
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({ access_token: 'access-2' })
      })
      .mockResolvedValueOnce({
        ok: true,
        body: streamFromChunks(['b'])
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const stream = await app.currentUser!.functions.callFunctionStreaming('streamData')
    const received: string[] = []
    for await (const chunk of stream) {
      received.push(new TextDecoder().decode(chunk))
    }

    expect(received).toContain('b')
  })
})
