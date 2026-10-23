type ParsedPayloadError = {
  message?: string
  error?: string
  errorCode?: string
  link?: string
}

const parsePayloadError = (payload: unknown): ParsedPayloadError => {
  if (!payload || typeof payload !== 'object') return {}

  const message =
    'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : undefined
  const error =
    'error' in payload && typeof payload.error === 'string' ? payload.error : undefined
  const errorCode =
    'error_code' in payload && typeof payload.error_code === 'string'
      ? payload.error_code
      : 'errorCode' in payload && typeof payload.errorCode === 'string'
        ? payload.errorCode
        : undefined
  const link =
    'link' in payload && typeof payload.link === 'string' ? payload.link : undefined

  if (error) {
    try {
      const parsed = JSON.parse(error)
      if (parsed && typeof parsed === 'object') {
        const nestedMessage =
          'message' in parsed && typeof parsed.message === 'string'
            ? parsed.message
            : undefined
        const nestedErrorCode =
          'error_code' in parsed && typeof parsed.error_code === 'string'
            ? parsed.error_code
            : 'errorCode' in parsed && typeof parsed.errorCode === 'string'
              ? parsed.errorCode
              : undefined
        return {
          message: nestedMessage ?? message ?? error,
          error,
          errorCode: nestedErrorCode ?? errorCode,
          link
        }
      }
    } catch {
      // Keep original error text if it isn't JSON.
    }
  }

  return {
    message: message ?? error,
    error,
    errorCode,
    link
  }
}

export class MongoDBRealmError extends Error {
  readonly method: string
  readonly url: string
  readonly statusCode: number
  readonly statusText: string
  readonly error: string | undefined
  readonly errorCode: string | undefined
  readonly link: string | undefined
  readonly payload?: unknown

  constructor(params: {
    method: string
    url: string
    statusCode: number
    statusText: string
    error?: string
    errorCode?: string
    link?: string
    payload?: unknown
  }) {
    super(params.error || `${params.statusCode} ${params.statusText}`.trim())
    this.name = 'MongoDBRealmError'
    this.method = params.method
    this.url = params.url
    this.statusCode = params.statusCode
    this.statusText = params.statusText
    this.error = params.error
    this.errorCode = params.errorCode
    this.link = params.link
    this.payload = params.payload
  }
}

export class FlowerbaseHttpError extends MongoDBRealmError {
  readonly status: number

  constructor(params: ConstructorParameters<typeof MongoDBRealmError>[0]) {
    super(params)
    this.name = 'FlowerbaseHttpError'
    this.status = params.statusCode
  }
}

type RequestParams = {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  bearerToken?: string
  timeout?: number
  signal?: AbortSignal
}

const parseBody = async (response: Response) => {
  const text = await response.text()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const timeoutSignal = (timeout = 10000, externalSignal?: AbortSignal) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const abort = () => controller.abort(externalSignal?.reason)
  externalSignal?.addEventListener('abort', abort, { once: true })
  if (externalSignal?.aborted) abort()

  return {
    controller,
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', abort)
    }
  }
}

export const requestJson = async <T = unknown>({
  url,
  method = 'GET',
  body,
  bearerToken,
  timeout,
  signal: externalSignal
}: RequestParams): Promise<T> => {
  const { signal, clear } = timeoutSignal(timeout, externalSignal)

  try {
    signal.throwIfAborted()
    const response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    })

    const payload = await parseBody(response)
    signal.throwIfAborted()

    if (!response.ok) {
      const parsedError = parsePayloadError(payload)
      throw new FlowerbaseHttpError({
        method,
        url,
        statusCode: response.status,
        statusText: response.statusText,
        error: parsedError.message ?? `HTTP ${response.status}`,
        errorCode: parsedError.errorCode,
        link: parsedError.link,
        payload
      })
    }

    return payload as T
  } finally {
    clear()
  }
}

export const requestStream = async ({
  url,
  method = 'GET',
  body,
  bearerToken,
  timeout,
  signal: externalSignal
}: RequestParams): Promise<AsyncIterable<Uint8Array>> => {
  const { controller, signal, clear } = timeoutSignal(timeout, externalSignal)
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let cancellation: Promise<void> | undefined
  const cancelReader = () => {
    if (!reader) return Promise.resolve()
    if (!cancellation) {
      const responseReader = reader
      cancellation = responseReader
        .cancel(signal.reason)
        .catch(() => {})
        .then(() => {
          responseReader.releaseLock()
        })
    }
    return cancellation
  }
  const cleanup = () => {
    clear()
    signal.removeEventListener('abort', onAbort)
  }
  const onAbort = () => {
    cleanup()
    void cancelReader()
  }
  const close = async () => {
    controller.abort()
    await cancelReader()
    cleanup()
  }
  signal.addEventListener('abort', onAbort, { once: true })

  try {
    signal.throwIfAborted()
    const response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    })

    if (!response.ok) {
      const payload = await parseBody(response)
      const parsedError = parsePayloadError(payload)
      throw new FlowerbaseHttpError({
        method,
        url,
        statusCode: response.status,
        statusText: response.statusText,
        error: parsedError.message ?? `HTTP ${response.status}`,
        errorCode: parsedError.errorCode,
        link: parsedError.link,
        payload
      })
    }

    if (!response.body) {
      throw new Error('Response stream body is missing')
    }

    reader = response.body.getReader()
    const streamReader = reader
    signal.throwIfAborted()
    const iterator = (async function* () {
      try {
        while (true) {
          signal.throwIfAborted()
          const { done, value } = await streamReader.read()
          signal.throwIfAborted()
          if (done) break
          if (value) yield value
        }
      } finally {
        await close()
      }
    })()
    const stream: AsyncIterableIterator<Uint8Array> = {
      [Symbol.asyncIterator]() {
        return this
      },
      next: () => iterator.next(),
      async return() {
        await close()
        return iterator.return(undefined)
      },
      async throw(error?: unknown) {
        await close()
        return iterator.throw(error)
      }
    }
    return stream
  } catch (error) {
    await close()
    throw error
  }
}
