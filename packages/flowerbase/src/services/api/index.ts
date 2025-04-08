import { HTTPS_SCHEMA } from '../../constants'
import { DeleteParams, GetParams, PostParams, PutParams } from './model'
import { makeRequest } from './utils'

/**
 * > This service is the Api Client that can be imported from the context
 */
const Api = () => ({
  get: async <T = null>({ url, headers = {} }: GetParams) => {
    return makeRequest<T>({ method: 'GET', url, headers })
  },
  post: async <T = null>({
    scheme = HTTPS_SCHEMA,
    host,
    path,
    url: currentUrl,
    headers = {},
    body,
    encodeBodyAsJSON = false
  }: PostParams) => {
    const formattedBody = encodeBodyAsJSON ? JSON.stringify(body) : body
    const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`
    return makeRequest<T>({ method: 'POST', url, headers: { "Content-Type": "application/json", ...headers, }, body: formattedBody })
  },
  put: async <T = null>({
    scheme = HTTPS_SCHEMA,
    host,
    path,
    url: currentUrl,
    headers = {},
    body,
    encodeBodyAsJSON = false
  }: PutParams) => {
    const formattedBody = encodeBodyAsJSON ? JSON.stringify(body) : body
    const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`
    return makeRequest<T>({ method: 'PUT', url, headers, body: formattedBody })
  },
  delete: async <T = null>({
    scheme = HTTPS_SCHEMA,
    host,
    path,
    url: currentUrl,
    headers = {}
  }: DeleteParams) => {
    const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`
    return makeRequest<T>({ method: 'DELETE', url, headers })
  }
})

export default Api
