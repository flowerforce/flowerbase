type ParsedPayloadError = {
  message?: string
  error?: string
  errorCode?: string
  link?: string
}

const parsePayloadError = (payload: unknown): ParsedPayloadError => {
  if (!payload || typeof payload !== 'object') return {}

  const message = 'message' in payload && typeof payload.message === 'string' ? payload.message : undefined
  const error = 'error' in payload && typeof payload.error === 'string' ? payload.error : undefined
  const errorCode =
    'error_code' in payload && typeof payload.error_code === 'string'
      ? payload.error_code
      : 'errorCode' in payload && typeof payload.errorCode === 'string'
        ? payload.errorCode
        : undefined
  const link = 'link' in payload && typeof payload.link === 'string' ? payload.link : undefined

  if (error) {
    try {
      const parsed = JSON.parse(error)
      if (parsed && typeof parsed === 'object') {
        const nestedMessage = 'message' in parsed && typeof parsed.message === 'string' ? parsed.message : undefined
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

const timeoutSignal = (timeout = 10000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  }
}

export const requestJson = async <T = unknown>({
  url,
  method = 'GET',
  body,
  bearerToken,
  timeout
}: RequestParams): Promise<T> => {
  const { signal, clear } = timeoutSignal(timeout)

  try {
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
  timeout
}: RequestParams): Promise<AsyncIterable<Uint8Array>> => {
  const { signal, clear } = timeoutSignal(timeout)

  try {
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

    const reader = response.body.getReader()
    return {
      async *[Symbol.asyncIterator]() {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) yield value
          }
        } finally {
          reader.releaseLock()
        }
      }
    }
  } finally {
    clear()
  }
}
