import { request } from 'undici'
import { Error, MakeRequestParams } from './model'

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
  body
}: MakeRequestParams) => {
  try {
    const response = await request<T>(url, {
      method,
      headers,
      body
    })
    return response
  } catch (error) {
    return _handleError(error as Error)
  }
}

/**
 * > Formats the request error
 * @param error -> the request error
 */
const _handleError = async (error: Error) => {
  return {
    status: error.statusCode || 500,
    headers: error.headers || {},
    body: { message: error.message }
  }
}
