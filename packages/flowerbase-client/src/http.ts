export class FlowerbaseHttpError extends Error {
  status: number
  payload?: unknown

  constructor(message: string, status: number, payload?: unknown) {
    super(message)
    this.name = 'FlowerbaseHttpError'
    this.status = status
    this.payload = payload
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
      let parsedErrorMessage: string | null = null
      if (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string') {
        try {
          const parsed = JSON.parse(payload.error)
          if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
            parsedErrorMessage = parsed.message
          }
        } catch {
          parsedErrorMessage = null
        }
      }

      const message =
        parsedErrorMessage ||
        (payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
          ? payload.message
          : null) ||
        (payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : null) ||
        `HTTP ${response.status}`
      throw new FlowerbaseHttpError(message, response.status, payload)
    }

    return payload as T
  } finally {
    clear()
  }
}
