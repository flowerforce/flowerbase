import { HTTPS_SCHEMA } from '../../constants'
import { emitServiceEvent } from '../monitoring'
import { DeleteParams, GetParams, PostParams, PutParams } from './model'
import { makeRequest } from './utils'

/**
 * > This service is the Api Client that can be imported from the context
 */
const Api = () => ({
  get: async <T = null>({ url, headers = {}, resolveBody = true }: GetParams) => {
    const meta = { method: 'GET', url }
    emitServiceEvent({
      type: 'api',
      source: 'service:api',
      message: 'api GET',
      data: meta
    })
    try {
      return await makeRequest<T>({ method: 'GET', url, headers, resolveBody })
    } catch (error) {
      emitServiceEvent({
        type: 'api',
        source: 'service:api',
        message: 'api GET failed',
        data: meta,
        error
      })
      throw error
    }
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
    const meta = { method: 'POST', url }
    emitServiceEvent({
      type: 'api',
      source: 'service:api',
      message: 'api POST',
      data: meta
    })
    try {
      return await makeRequest<T>({
        method: 'POST',
        url,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: formattedBody,
        resolveBody
      })
    } catch (error) {
      emitServiceEvent({
        type: 'api',
        source: 'service:api',
        message: 'api POST failed',
        data: meta,
        error
      })
      throw error
    }
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
    const meta = { method: 'PUT', url }
    emitServiceEvent({
      type: 'api',
      source: 'service:api',
      message: 'api PUT',
      data: meta
    })
    try {
      return await makeRequest<T>({
        method: 'PUT',
        url,
        headers,
        body: formattedBody,
        resolveBody
      })
    } catch (error) {
      emitServiceEvent({
        type: 'api',
        source: 'service:api',
        message: 'api PUT failed',
        data: meta,
        error
      })
      throw error
    }
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
    const meta = { method: 'DELETE', url }
    emitServiceEvent({
      type: 'api',
      source: 'service:api',
      message: 'api DELETE',
      data: meta
    })
    try {
      return await makeRequest<T>({ method: 'DELETE', url, headers, resolveBody })
    } catch (error) {
      emitServiceEvent({
        type: 'api',
        source: 'service:api',
        message: 'api DELETE failed',
        data: meta,
        error
      })
      throw error
    }
  }
})

export default Api
