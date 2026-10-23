import { requestJson, requestStream } from '../http'

describe('flowerbase-client HTTP cancellation', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  it('cancels the response and request when a streaming consumer stops early', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
      },
      cancel
    })
    const lifecycle = new AbortController()
    const removeListener = jest.spyOn(lifecycle.signal, 'removeEventListener')
    global.fetch = jest.fn().mockResolvedValue(new Response(body))

    const stream = await requestStream({
      url: 'http://localhost/stream',
      signal: lifecycle.signal
    })
    for await (const chunk of stream) {
      expect(chunk).toEqual(new Uint8Array([1]))
      break
    }

    expect(cancel).toHaveBeenCalledTimes(1)
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true)
    expect(body.locked).toBe(false)
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(jest.getTimerCount()).toBe(0)
  })

  it('aborts pending body reads when the session signal is aborted', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const lifecycle = new AbortController()
    const stream = await requestStream({
      url: 'http://localhost/stream',
      signal: lifecycle.signal
    })
    const result = expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      name: 'AbortError'
    })

    lifecycle.abort()
    await result

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps the request deadline active while the response body is being consumed', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const stream = await requestStream({ url: 'http://localhost/stream', timeout: 20 })
    const result = expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      name: 'AbortError'
    })

    await jest.advanceTimersByTimeAsync(20)
    await result

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('cancels a response even if the consumer has not started reading', async () => {
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const lifecycle = new AbortController()
    const removeListener = jest.spyOn(lifecycle.signal, 'removeEventListener')
    const stream = await requestStream({
      url: 'http://localhost/stream',
      signal: lifecycle.signal
    })

    lifecycle.abort()
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    await expect(stream[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      name: 'AbortError'
    })
    expect(body.locked).toBe(false)
  })

  it('does not start requests for an already aborted session', async () => {
    jest.useFakeTimers()
    const lifecycle = new AbortController()
    lifecycle.abort()
    global.fetch = jest.fn()

    await expect(
      requestStream({
        url: 'http://localhost/stream',
        signal: lifecycle.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      requestJson({
        url: 'http://localhost/data',
        signal: lifecycle.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })

  it('releases the body and deadline when a stream completes normally', async () => {
    jest.useFakeTimers()
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.close()
      }
    })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const stream = await requestStream({ url: 'http://localhost/stream' })
    const received: Uint8Array[] = []
    for await (const chunk of stream) received.push(chunk)

    expect(received).toEqual([new Uint8Array([1])])
    expect(body.locked).toBe(false)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('cancels an iterator returned before its first read', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    const lifecycle = new AbortController()
    const removeListener = jest.spyOn(lifecycle.signal, 'removeEventListener')
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const stream = await requestStream({
      url: 'http://localhost/stream',
      signal: lifecycle.signal
    })
    const iterator = stream[Symbol.asyncIterator]()

    await expect(iterator.return!(undefined)).resolves.toEqual({
      done: true,
      value: undefined
    })

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true)
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(jest.getTimerCount()).toBe(0)
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
  })

  it('cancels an iterator thrown into before its first read', async () => {
    jest.useFakeTimers()
    const cancel = jest.fn()
    const body = new ReadableStream<Uint8Array>({ cancel })
    global.fetch = jest.fn().mockResolvedValue(new Response(body))
    const stream = await requestStream({ url: 'http://localhost/stream' })
    const iterator = stream[Symbol.asyncIterator]()
    const error = new Error('Consumer stopped')

    await expect(iterator.throw!(error)).rejects.toBe(error)

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(body.locked).toBe(false)
    expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true)
    expect(jest.getTimerCount()).toBe(0)
  })
})
