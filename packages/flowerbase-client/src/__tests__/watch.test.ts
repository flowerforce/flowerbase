import { App } from '../app'
import { EJSON, ObjectId } from '../bson'
import { Credentials } from '../credentials'
import { createWatchIterator } from '../watch'

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

const decodeBaasRequest = (url: string) => {
  const parsedUrl = new URL(url)
  const encoded = parsedUrl.searchParams.get('baas_request')
  if (!encoded) throw new Error('baas_request missing')
  const base64 = decodeURIComponent(encoded)
  const json = Buffer.from(base64, 'base64').toString('utf8')
  return EJSON.deserialize(JSON.parse(json)) as {
    arguments: Array<{
      filter?: Record<string, unknown>
      ids?: unknown[]
    }>
  }
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

  it('maps watch ids/filter options into watch arguments', async () => {
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

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')

    const byIds = collection.watch({ ids: ['id-1', 'id-2'] })
    byIds.close()
    const firstRequest = decodeBaasRequest((global.fetch as jest.Mock).mock.calls[2][0] as string)
    expect(firstRequest.arguments[0].ids).toEqual(['id-1', 'id-2'])
    expect(firstRequest.arguments[0].filter).toBeUndefined()

    const byFilter = collection.watch({ filter: { operationType: 'insert' } })
    byFilter.close()
    const secondRequest = decodeBaasRequest((global.fetch as jest.Mock).mock.calls[3][0] as string)
    expect(secondRequest.arguments[0].filter).toEqual({ operationType: 'insert' })
    expect(secondRequest.arguments[0].ids).toBeUndefined()
  })

  it('preserves ObjectId values in watch filter payload', async () => {
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

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')
    const requestId = new ObjectId('69a282a75cd849c244e001ca')

    const iterator = collection.watch({
      filter: {
        'fullDocument.requestId': requestId,
        operationType: 'update'
      }
    })
    iterator.close()

    const request = decodeBaasRequest((global.fetch as jest.Mock).mock.calls[2][0] as string)
    const decodedRequestId = request.arguments[0].filter?.['fullDocument.requestId']
    expect(decodedRequestId).toBeInstanceOf(ObjectId)
    expect((decodedRequestId as ObjectId).toHexString()).toBe(requestId.toHexString())
  })

  it('rejects pipeline-based watch signature', async () => {
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

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')

    expect(() =>
      collection.watch([{ $match: { operationType: 'update', 'fullDocument.type': 'perennial' } }])
    ).toThrow('watch accepts only an options object with "filter" or "ids"')
  })

  it('rejects unsupported watch option keys', async () => {
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
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')
    expect(() => collection.watch({ fullDocument: 'updateLookup' })).toThrow(
      'watch options support only "filter" or "ids"'
    )
  })

  it('rejects watch options with both ids and filter', async () => {
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
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')
    expect(() => collection.watch({ ids: ['id-1'], filter: { operationType: 'insert' } })).toThrow(
      'watch options cannot include both "ids" and "filter"'
    )
  })

  it('rejects $match inside watch filter object', async () => {
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
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')
    expect(() => collection.watch({ filter: { $match: { operationType: 'insert' } } })).toThrow(
      'watch filter must be a query object, not a $match stage'
    )
  })

  it('discards buffered events and cancels an active watch when its user logs out', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"private":"first"}\n\ndata: {"private":"buffered"}\n\n'
          )
        )
      },
      cancel
    })
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'access',
            refresh_token: 'refresh',
            user_id: 'watch-logout-user'
          })
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' })))
      .mockResolvedValueOnce(new Response(body))
      .mockResolvedValueOnce(new Response('{}'))
    const app = new App({ id: 'watch-logout-app', baseUrl: 'http://localhost:3000' })
    const user = await app.logIn(Credentials.anonymous())
    const iterator = user
      .mongoClient('mongodb-atlas')
      .db('testdb')
      .collection('todos')
      .watch()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { private: 'first' }
    })

    await user.logOut()

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(cancel).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[2][1].signal.aborted).toBe(true)
    expect(body.locked).toBe(false)
    await jest.advanceTimersByTimeAsync(10000)
    expect(global.fetch).toHaveBeenCalledTimes(4)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('resolves pending consumers and removes the session listener on cancellation', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const lifecycle = new AbortController()
    const removeListener = jest.spyOn(lifecycle.signal, 'removeEventListener')
    const iterator = createWatchIterator({
      appId: 'watch-cancel',
      baseUrl: 'http://localhost',
      accessToken: 'access',
      database: 'testdb',
      collection: 'todos',
      signal: lifecycle.signal
    })
    const pending = iterator.next()
    await Promise.resolve()

    lifecycle.abort()

    await expect(pending).resolves.toEqual({ done: true, value: undefined })
    await jest.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(body.locked).toBe(false)
  })

  it('clears its reconnect delay when closed', async () => {
    jest.useFakeTimers()
    global.fetch = jest.fn().mockRejectedValue(new Error('network'))
    const iterator = createWatchIterator({
      appId: 'watch-reconnect-cancel',
      baseUrl: 'http://localhost',
      accessToken: 'access',
      database: 'testdb',
      collection: 'todos'
    })
    await jest.advanceTimersByTimeAsync(0)
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(1)

    iterator.close()
    await jest.advanceTimersByTimeAsync(10000)

    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('does not open a watch for an already aborted session', async () => {
    global.fetch = jest.fn()
    const lifecycle = new AbortController()
    lifecycle.abort()
    const iterator = createWatchIterator({
      appId: 'watch-already-cancelled',
      baseUrl: 'http://localhost',
      accessToken: 'access',
      database: 'testdb',
      collection: 'todos',
      signal: lifecycle.signal
    })

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('pauses stream reads until queued events are consumed', async () => {
    jest.useFakeTimers()
    const pull = jest.fn((controller: ReadableStreamDefaultController<Uint8Array>) => {
      controller.enqueue(new TextEncoder().encode('data: {"operationType":"insert"}\n\n'))
    })
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const iterator = createWatchIterator({
      appId: 'watch-backpressure',
      baseUrl: 'http://localhost',
      accessToken: 'access',
      database: 'testdb',
      collection: 'todos'
    })
    await jest.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(1)

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { operationType: 'insert' }
    })
    await jest.advanceTimersByTimeAsync(0)
    expect(pull).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(1000)
    expect(pull).toHaveBeenCalledTimes(2)

    iterator.close()
    await jest.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
  })
})
