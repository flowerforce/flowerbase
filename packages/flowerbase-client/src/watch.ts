import { WatchAsyncIterator, WatchConfig } from './types'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const createWatchRequest = ({ database, collection, pipeline = [], options = {} }: WatchConfig) => ({
  name: 'watch',
  service: 'mongodb-atlas',
  arguments: [
    {
      database,
      collection,
      pipeline,
      options
    }
  ]
})

const toBase64 = (input: string) => {
  if (typeof btoa === 'function') {
    return btoa(input)
  }
  throw new Error('Base64 encoder not available in current runtime')
}

const parseSsePayload = (line: string) => {
  if (!line.startsWith('data:')) return null
  const raw = line.slice(5).trim()
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

export const createWatchIterator = (config: WatchConfig): WatchAsyncIterator<unknown> => {
  let closed = false
  let activeController: AbortController | null = null
  const queue: unknown[] = []
  const waiters: Array<(value: IteratorResult<unknown>) => void> = []

  const enqueue = (value: unknown) => {
    const waiter = waiters.shift()
    if (waiter) {
      waiter({ done: false, value })
      return
    }
    queue.push(value)
  }

  const close = () => {
    if (closed) return
    closed = true
    activeController?.abort()
    while (waiters.length > 0) {
      const resolve = waiters.shift()
      resolve?.({ done: true, value: undefined })
    }
  }

  const run = async () => {
    let attempts = 0
    while (!closed) {
      const controller = new AbortController()
      activeController = controller
      const request = createWatchRequest(config)
      const encoded = toBase64(JSON.stringify(request))
      const url = `${config.baseUrl}/api/client/v2.0/app/${config.appId}/functions/call?baas_request=${encodeURIComponent(encoded)}`

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            Accept: 'text/event-stream'
          },
          signal: controller.signal
        })

        if (!response.ok || !response.body) {
          throw new Error(`Watch request failed (${response.status})`)
        }

        attempts = 0
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (!closed) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const parsed = parseSsePayload(line)
            if (parsed !== null) {
              enqueue(parsed)
            }
          }
        }
      } catch {
        if (closed) {
          break
        }
      }

      if (closed) {
        break
      }

      attempts += 1
      const backoff = Math.min(5000, 250 * 2 ** (attempts - 1))
      await sleep(backoff)
    }
  }

  void run()

  return {
    [Symbol.asyncIterator]() {
      return this
    },
    next() {
      if (queue.length > 0) {
        return Promise.resolve({ done: false, value: queue.shift() })
      }

      if (closed) {
        return Promise.resolve({ done: true, value: undefined })
      }

      return new Promise((resolve) => {
        waiters.push(resolve)
      })
    },
    return() {
      close()
      return Promise.resolve({ done: true, value: undefined })
    },
    throw(error?: unknown) {
      close()
      return Promise.reject(error)
    },
    close
  }
}
