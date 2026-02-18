import { App } from '../app'
import { Credentials } from '../credentials'

const streamFromLines = (lines: string[]) => {
  const encoded = lines.map((line) => `${line}\n`).join('')
  const bytes = new TextEncoder().encode(encoded)

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    }
  })
}

describe('flowerbase-client watch', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    jest.useRealTimers()
    global.fetch = originalFetch
  })

  it('receives SSE events through watch iterator', async () => {
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
        body: streamFromLines(['data: {"operationType":"insert","fullDocument":{"title":"A"}}', ''])
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const iterator = app.currentUser!
      .mongoClient('mongodb-atlas')
      .db('testdb')
      .collection('todos')
      .watch()

    const first = await iterator.next()
    expect(first.done).toBe(false)
    expect(first.value).toEqual({ operationType: 'insert', fullDocument: { title: 'A' } })

    iterator.close()

    const [url, request] = (global.fetch as jest.Mock).mock.calls[2]
    expect(url).toContain('/functions/call?baas_request=')
    expect(request.headers.Authorization).toBe('Bearer access')
  })

  it('closes iterator on return', async () => {
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
      .mockResolvedValue({
        ok: true,
        body: streamFromLines([])
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const iterator = app.currentUser!
      .mongoClient('mongodb-atlas')
      .db('testdb')
      .collection('todos')
      .watch()

    iterator.close()
    const result = await iterator.next()
    expect(result.done).toBe(true)
  })

  it('reconnects with backoff after network errors', async () => {
    jest.useFakeTimers()
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
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        ok: true,
        body: streamFromLines(['data: {"operationType":"update"}', ''])
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const iterator = app.currentUser!
      .mongoClient('mongodb-atlas')
      .db('testdb')
      .collection('todos')
      .watch()

    await jest.advanceTimersByTimeAsync(250)
    const result = await iterator.next()

    expect(result.done).toBe(false)
    expect(result.value).toEqual({ operationType: 'update' })
    expect((global.fetch as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(4)

    iterator.close()
  })
})
