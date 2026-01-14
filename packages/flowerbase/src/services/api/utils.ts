import { buffer as consumeBuffer } from 'node:stream/consumers'
import { request } from 'undici'
import { Error, MakeRequestParams } from './model'

const createResolvedBody = (bodyBuffer: Buffer) => {
  const arrayBuffer = bodyBuffer.buffer.slice(
    bodyBuffer.byteOffset,
    bodyBuffer.byteOffset + bodyBuffer.byteLength
  )
  const text = bodyBuffer.toString('utf8')
  return {
    text: () => text,
    json: () => JSON.parse(text),
    arrayBuffer: () => arrayBuffer,
    bytes: () => new Uint8Array(arrayBuffer)
  }
}

/**
 * > Creates the http request
 * @param method -> the HTTP METHOD
 * @param url -> url string
 * @param headers -> request headers
 * @param body -> request body
 */
export const makeRequest = async <T = null>({
  method,
  url,
  headers,
  body,
  resolveBody = true
}: MakeRequestParams) => {
  try {
    const response = await request<T>(url, {
      method,
      headers,
      body
    })
    if (!resolveBody) return response
    const bodyBuffer = await consumeBuffer(response.body)
    return {
      ...response,
      body: createResolvedBody(bodyBuffer)
    }
  } catch (error) {
    return _handleError(error as Error, resolveBody)
  }
}

/**
 * > Formats the request error
 * @param error -> the request error
 */
const _handleError = async (error: Error, resolveBody: boolean) => {
  const payload = { message: error.message }
  const response = {
    status: error.statusCode || 500,
    headers: error.headers || {},
    body: payload
  }
  if (!resolveBody) return response
  const bodyBuffer = Buffer.from(JSON.stringify(payload), 'utf8')
  return { ...response, body: createResolvedBody(bodyBuffer) }
}
