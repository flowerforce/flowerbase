import { HTTPS_SCHEMA } from '../../constants'
import { DeleteParams, GetParams, PostParams, PutParams } from './model'
import { makeRequest } from './utils'

/**
 * > This service is the Api Client that can be imported from the context
 */
const Api = () => ({
  get: async <T = null>({ url, headers = {}, resolveBody = true }: GetParams) => {
    return makeRequest<T>({ method: 'GET', url, headers, resolveBody })
  },
  post: async <T = null>({
    scheme = HTTPS_SCHEMA,
    host,
    path,
    url: currentUrl,
    headers = {},
    body,
    encodeBodyAsJSON = false,
    resolveBody = true
  }: PostParams) => {
    const formattedBody = encodeBodyAsJSON ? JSON.stringify(body) : body
    const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`
    return makeRequest<T>({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: formattedBody,
      resolveBody
    })
  },
  put: async <T = null>({
    scheme = HTTPS_SCHEMA,
    host,
    path,
    url: currentUrl,
    headers = {},
    body,
    encodeBodyAsJSON = false,
    resolveBody = true
  }: PutParams) => {
    const formattedBody = encodeBodyAsJSON ? JSON.stringify(body) : body
    const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`
    return makeRequest<T>({
      method: 'PUT',
      url,
      headers,
      body: formattedBody,
      resolveBody
    })
  },
  delete: async <T = null>({
    scheme = HTTPS_SCHEMA,
    host,
    path,
    url: currentUrl,
    headers = {},
    resolveBody = true
  }: DeleteParams) => {
    const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`
    return makeRequest<T>({ method: 'DELETE', url, headers, resolveBody })
  }
})

export default Api
