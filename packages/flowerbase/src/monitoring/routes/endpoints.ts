import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import type { InjectOptions, Response as InjectResponse } from 'light-my-request'
import { StateManager } from '../../state'
import { createEventId, MonitorEvent, sanitize } from '../utils'

type EndpointInvokeBody = {
  route?: string
  method?: string
  query?: Record<string, unknown>
  headers?: Record<string, unknown>
  payload?: unknown
  functionName?: string
}

type EndpointResponse = {
  statusCode: number
  headers: Record<string, string>
  body: unknown
}

export type EndpointRoutesDeps = {
  prefix: string
  allowInvoke: boolean
  addEvent: (event: MonitorEvent) => void
}

const getProjectId = () => {
  const projectId = StateManager.select('projectId')
  if (projectId && projectId.trim()) return projectId.trim()
  const fallbackPath = process.env.FLOWERBASE_APP_PATH ?? process.cwd()
  return path.basename(fallbackPath)
}

const buildQueryString = (query?: Record<string, unknown>) => {
  if (!query) return ''
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value))
  })
  return params.toString()
}

const normalizeRoute = (value?: string) => {
  return (value || '').replace(/^\/+/, '').trim()
}

const normalizeHeaders = (headers?: Record<string, unknown>) => {
  const normalized: Record<string, string> = {}
  if (!headers) return normalized
  Object.entries(headers).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    normalized[key] = String(value)
  })
  return normalized
}

const parseInjectResponse = (payload: string | Buffer) => {
  const text = payload instanceof Buffer ? payload.toString('utf8') : String(payload)
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const registerEndpointRoutes = (app: FastifyInstance, deps: EndpointRoutesDeps) => {
  const { prefix, allowInvoke, addEvent } = deps

  app.get(`${prefix}/api/endpoints`, async () => {
    const endpoints = StateManager.select('endpoints')
    return { items: endpoints }
  })

  app.post(`${prefix}/api/endpoints/invoke`, async (req, reply) => {
    if (!allowInvoke) {
      reply.code(403)
      return { error: 'Endpoint invocation disabled' }
    }
    const body = req.body as EndpointInvokeBody
    const route = body.route?.trim()
    if (!route) {
      reply.code(400)
      return { error: 'Missing route' }
    }
    const projectId = getProjectId()
    if (!projectId) {
      reply.code(400)
      return { error: 'Project ID not available' }
    }
    const normalizedRoute = normalizeRoute(route)
    const rawMethod = (body.method || 'POST').toUpperCase()
    const method = rawMethod as InjectOptions['method']
    const effectiveMethod = (rawMethod === 'ALL' ? 'POST' : rawMethod) as InjectOptions['method']
    const functionName = body.functionName?.trim()
    const functionsList = StateManager.select('functions') as Record<string, { run_as_system?: boolean }>
    const runAsSystem = functionName ? !!functionsList?.[functionName]?.run_as_system : undefined
    const queryString = buildQueryString(body.query)
    const encodedProjectId = encodeURIComponent(projectId)
    const baseUrl = `/app/${encodedProjectId}/endpoint/${normalizedRoute}`
    const url = baseUrl + (queryString ? `?${queryString}` : '')
    const headers = normalizeHeaders(body.headers)
    const hasPayload = body.payload !== undefined
    let payload: string | undefined
    if (hasPayload) {
      if (typeof body.payload === 'string') {
        payload = body.payload
      } else {
        payload = JSON.stringify(body.payload)
      }
      if (payload && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
        headers['content-type'] = 'application/json'
      }
    }
    const injectOptions: InjectOptions = {
      method: effectiveMethod,
      url,
      headers,
      payload
    }
    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'http_endpoint',
      source: 'monit',
      message: `${rawMethod} ${route}`,
      data: sanitize({
        method: effectiveMethod,
        route,
        query: body.query,
        headers: body.headers,
        payload: body.payload,
        functionName
      })
    })
    if (functionName) {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'function',
        source: 'monit',
        message: `invoke ${functionName}`,
        data: sanitize({
          name: functionName,
          runAsSystem,
          invokedFrom: functionName,
          endpoint: { method: rawMethod, route }
        })
      })
    }
    const response = await app.inject(injectOptions) as InjectResponse
    const parsedBody = parseInjectResponse(response.payload)
    const responseHeaders: Record<string, string> = {}
    Object.entries(response.headers ?? {}).forEach(([key, value]) => {
      if (value === undefined) return
      responseHeaders[key] = Array.isArray(value) ? value.join(', ') : String(value)
    })
    const result: EndpointResponse = {
      statusCode: response.statusCode,
      headers: responseHeaders,
      body: parsedBody
    }
    return result
  })
}
