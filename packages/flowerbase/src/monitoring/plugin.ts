import fastifyWebsocket from '@fastify/websocket'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import '@fastify/websocket'
import { DEFAULT_CONFIG } from '../constants'
import type { Rules } from '../features/rules/interface'
import { services as coreServices } from '../services'
import { registerCollectionRoutes } from './routes/collections'
import { registerEventsRoutes } from './routes/events'
import { registerFunctionRoutes } from './routes/functions'
import { registerTriggerRoutes } from './routes/triggers'
import { registerUserRoutes } from './routes/users'
import {
  buildRulesMeta,
  classifyRequest,
  CollectionHistoryItem,
  createEventId,
  createEventStore,
  DAY_MS,
  EventStore,
  FunctionHistoryItem,
  isPromiseLike,
  isTestEnv,
  MonitMeta,
  MonitorEvent,
  pickHeaders,
  readAsset,
  resolveAssetCandidates,
  safeStringify,
  sanitize
} from './utils'

const MONIT_REALM = 'Flowerbase Monitor'

const wrapServicesForMonitoring = (addEvent: (event: MonitorEvent) => void) => {
  const wrapped = coreServices as unknown as Record<
    string,
    (app: FastifyInstance, options: Record<string, unknown>) => unknown
  > & { __monitWrapped?: boolean }
  if (wrapped.__monitWrapped) return
  wrapped.__monitWrapped = true

  const serviceTypeMap: Record<string, string> = {
    api: 'api',
    aws: 'aws',
    auth: 'auth',
    'mongodb-atlas': 'mongo'
  }
  const initMethodMap: Record<string, Set<string>> = {
    aws: new Set(['lambda', 's3']),
    'mongodb-atlas': new Set(['db', 'collection', 'limit', 'skip', 'toArray'])
  }

  const cache = new WeakMap<object, unknown>()

  const wrapValue = (
    value: unknown,
    path: string,
    serviceName: string,
    meta?: MonitMeta
  ): unknown => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value
    if (isPromiseLike(value)) return value

    if (cache.has(value as object)) {
      return cache.get(value as object)
    }

    const handler: ProxyHandler<object> = {
      get(target, prop, receiver) {
        const propValue = Reflect.get(target, prop, receiver) as unknown
        if (typeof prop === 'symbol') return propValue
        if (prop === 'constructor' || prop === 'toJSON') return propValue
        if (typeof propValue === 'function') {
          const propName = String(prop)
          const fnPath = `${path}.${propName}`
          const wrappedFn = (...args: unknown[]) => {
            let nextMeta = meta
            if (serviceName === 'mongodb-atlas') {
              if (propName === 'db' && typeof args[0] === 'string') {
                nextMeta = { ...(meta ?? { serviceName }), dbName: args[0], serviceName }
              }
              if (propName === 'collection' && typeof args[0] === 'string') {
                nextMeta = {
                  ...(meta ?? { serviceName }),
                  collection: args[0],
                  serviceName
                }
              }
            }
            const shouldLog = !(initMethodMap[serviceName]?.has(propName))
            if (shouldLog) {
              const ruleInfo = buildRulesMeta(nextMeta ?? meta)
              addEvent({
                id: createEventId(),
                ts: Date.now(),
                type: serviceTypeMap[serviceName] ?? 'service',
                source: `service:${serviceName}`,
                message: fnPath,
                data: sanitize({ args, rules: ruleInfo })
              })
            }
            let result: unknown
            try {
              result = (propValue as (...inner: unknown[]) => unknown).apply(target, args)
            } catch (error) {
              addEvent({
                id: createEventId(),
                ts: Date.now(),
                type: 'error',
                source: `service:${serviceName}`,
                message: `error ${fnPath}`,
                data: sanitize({ error })
              })
              throw error
            }
            if (isPromiseLike(result)) {
              return (result as Promise<unknown>).catch((error) => {
                addEvent({
                  id: createEventId(),
                  ts: Date.now(),
                  type: 'error',
                  source: `service:${serviceName}`,
                  message: `error ${fnPath}`,
                  data: sanitize({ error })
                })
                throw error
              })
            }
            return wrapValue(result, fnPath, serviceName, nextMeta)
          }
          return wrappedFn
        }
        return wrapValue(propValue, `${path}.${String(prop)}`, serviceName, meta)
      }
    }

    const proxied = new Proxy(value as object, handler)
    cache.set(value as object, proxied)
    return proxied
  }

  Object.keys(coreServices).forEach((serviceName) => {
    const original = wrapped[serviceName]
    wrapped[serviceName] = (app: FastifyInstance, options: Record<string, unknown>) => {
      const instance = (original as typeof original)(app, options)
      const meta: MonitMeta = {
        serviceName,
        rules: options.rules as Rules | undefined,
        user: options.user,
        runAsSystem: Boolean(options.run_as_system)
      }
      return wrapValue(instance, serviceName, serviceName, meta)
    }
  })
}

const createMonitoringPlugin = fp(async (
  app: FastifyInstance,
  opts: { basePath?: string } = {}
) => {
  if (isTestEnv()) return

  const enabled = DEFAULT_CONFIG.MONIT_ENABLED
  if (!enabled) return

  const rawPrefix = typeof opts.basePath === 'string' ? opts.basePath : '/monit'
  const normalizedPrefix = rawPrefix.startsWith('/') ? rawPrefix : `/${rawPrefix}`
  const prefix = normalizedPrefix.endsWith('/')
    ? normalizedPrefix.slice(0, -1)
    : normalizedPrefix
  const maxAgeMs = Math.max(1, DEFAULT_CONFIG.MONIT_CACHE_HOURS) * 60 * 60 * 1000
  const maxEvents = Math.max(1000, DEFAULT_CONFIG.MONIT_MAX_EVENTS)
  const allowedIps = DEFAULT_CONFIG.MONIT_ALLOWED_IPS
  const rateLimitWindowMs = Math.max(0, DEFAULT_CONFIG.MONIT_RATE_LIMIT_WINDOW_MS)
  const rateLimitMax = Math.max(0, DEFAULT_CONFIG.MONIT_RATE_LIMIT_MAX)
  const allowInvoke = DEFAULT_CONFIG.MONIT_ALLOW_INVOKE
  const allowEdit = DEFAULT_CONFIG.MONIT_ALLOW_EDIT

  const eventStore: EventStore = createEventStore(maxAgeMs || DAY_MS, maxEvents)
  const functionHistory: FunctionHistoryItem[] = []
  const maxHistory = 30
  const collectionHistory: CollectionHistoryItem[] = []
  const maxCollectionHistory = 30
  const statsState = {
    lastCpu: process.cpuUsage(),
    lastHr: process.hrtime.bigint(),
    maxRssMb: 0,
    maxCpu: 0
  }
  const clients = new Set<{ send: (data: string) => void; readyState: number }>()
  const addFunctionHistory = (entry: FunctionHistoryItem) => {
    functionHistory.unshift(entry)
    if (functionHistory.length > maxHistory) {
      functionHistory.splice(maxHistory)
    }
  }
  const addCollectionHistory = (entry: CollectionHistoryItem) => {
    collectionHistory.unshift(entry)
    if (collectionHistory.length > maxCollectionHistory) {
      collectionHistory.splice(maxCollectionHistory)
    }
  }

  const rateBucket = new Map<string, { count: number; resetAt: number }>()
  const isRateLimited = (key: string) => {
    if (rateLimitMax <= 0 || rateLimitWindowMs <= 0) return false
    const now = Date.now()
    const current = rateBucket.get(key)
    if (!current || now > current.resetAt) {
      rateBucket.set(key, { count: 1, resetAt: now + rateLimitWindowMs })
      return false
    }
    current.count += 1
    if (current.count > rateLimitMax) {
      return true
    }
    return false
  }

  const round1 = (value: number) => Math.round(value * 10) / 10

  const getStats = () => {
    const mem = process.memoryUsage()
    const rssMb = mem.rss / (1024 * 1024)
    const now = process.hrtime.bigint()
    const currentCpu = process.cpuUsage()
    const deltaCpu = {
      user: currentCpu.user - statsState.lastCpu.user,
      system: currentCpu.system - statsState.lastCpu.system
    }
    const deltaTimeMicros = Number(now - statsState.lastHr) / 1000
    const cpuPercent =
      deltaTimeMicros > 0
        ? ((deltaCpu.user + deltaCpu.system) / deltaTimeMicros) * 100
        : 0

    statsState.lastCpu = currentCpu
    statsState.lastHr = now
    statsState.maxRssMb = Math.max(statsState.maxRssMb, rssMb)
    statsState.maxCpu = Math.max(statsState.maxCpu, cpuPercent)

    return {
      ramMb: round1(rssMb),
      cpuPercent: round1(cpuPercent),
      topRamMb: round1(statsState.maxRssMb),
      topCpuPercent: round1(statsState.maxCpu),
      uptimeSec: Math.round(process.uptime())
    }
  }

  const addEvent = (event: MonitorEvent) => {
    const sanitizedEvent: MonitorEvent = {
      ...event,
      data: sanitize(event.data),
      message: event.message
    }
    eventStore.add(sanitizedEvent)
    const payload = JSON.stringify({ type: 'event', event: sanitizedEvent })
    clients.forEach((client) => {
      if (client.readyState !== 1) return
      try {
        client.send(payload)
      } catch {
        clients.delete(client)
      }
    })
  }

  wrapServicesForMonitoring(addEvent)

  if (DEFAULT_CONFIG.MONIT_CAPTURE_CONSOLE) {
    const original = {
      log: console.log,
      error: console.error,
      warn: console.warn
    }

    console.log = (...args: unknown[]) => {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'log',
        source: 'console',
        message: args.map((item) => (typeof item === 'string' ? item : safeStringify(item))).join(' '),
        data: sanitize(args)
      })
      original.log(...args)
    }

    console.error = (...args: unknown[]) => {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'error',
        source: 'console',
        message: args.map((item) => (typeof item === 'string' ? item : safeStringify(item))).join(' '),
        data: sanitize(args)
      })
      original.error(...args)
    }

    console.warn = (...args: unknown[]) => {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'warn',
        source: 'console',
        message: args.map((item) => (typeof item === 'string' ? item : safeStringify(item))).join(' '),
        data: sanitize(args)
      })
      original.warn(...args)
    }
  }

  const hasCredentials = () =>
    Boolean(DEFAULT_CONFIG.MONIT_USER && DEFAULT_CONFIG.MONIT_PASSWORD)

  const isAuthorized = (req: FastifyRequest) => {
    if (!hasCredentials()) return false
    const header = req.headers.authorization
    if (!header || !header.startsWith('Basic ')) return false
    const encoded = header.slice('Basic '.length)
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    const [user, pass] = decoded.split(':')
    return user === DEFAULT_CONFIG.MONIT_USER && pass === DEFAULT_CONFIG.MONIT_PASSWORD
  }

  const isMonitRoute = (url: string) => {
    const path = url.split('?')[0]
    return path === prefix || path.startsWith(`${prefix}/`)
  }
  const shouldSkipLog = (req: FastifyRequest) => isMonitRoute(req.url)

  app.addHook('onRequest', (req, reply, done) => {
    if (isMonitRoute(req.url)) {
      const audit = (status: 'deny', reason?: string) => {
        addEvent({
          id: createEventId(),
          ts: Date.now(),
          type: 'auth',
          source: 'monit',
          message: `monit ${status}`,
          data: sanitize({
            status,
            reason,
            ip: req.ip,
            method: req.method,
            path: req.url
          })
        })
      }
      const allowAllIps = allowedIps.includes('0.0.0.0') || allowedIps.includes('*')
      if (allowedIps.length && !allowAllIps && !allowedIps.includes(req.ip)) {
        audit('deny', 'ip')
        reply.code(403).send({ message: 'Forbidden' })
        return
      }
      if (isRateLimited(req.ip)) {
        audit('deny', 'rate_limit')
        reply.code(429).send({ message: 'Too Many Requests' })
        return
      }
      if (!hasCredentials()) {
        audit('deny', 'missing_credentials')
        reply.code(503).send({ message: 'Monitoring credentials not configured' })
        return
      }
      if (!isAuthorized(req)) {
        audit('deny', 'basic_auth')
        reply
          .code(401)
          .header('WWW-Authenticate', `Basic realm="${MONIT_REALM}"`)
          .send({ message: 'Unauthorized' })
        return
      }
    }
    (req as { __monitStart?: number }).__monitStart = Date.now()
    done()
  })

  app.addHook('onResponse', (req, reply, done) => {
    if (shouldSkipLog(req)) {
      done()
      return
    }
    const start = (req as { __monitStart?: number }).__monitStart ?? Date.now()
    const duration = Date.now() - start
    const url = req.url ?? ''
    const type = classifyRequest(url)
    const data: Record<string, unknown> = {
      method: req.method,
      url,
      statusCode: reply.statusCode,
      durationMs: duration,
      ip: req.ip,
      query: sanitize(req.query),
      headers: pickHeaders(req.headers)
    }

    if (type === 'function') {
      const body = req.body as { name?: string; arguments?: unknown } | undefined
      if (body?.name) {
        data.function = body.name
        data.arguments = sanitize(body.arguments)
      }
    }

    if (type === 'auth') {
      const body = req.body as { email?: string; username?: string } | undefined
      if (body?.email || body?.username) {
        data.user = body.email ?? body.username
      }
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type,
      source: 'http',
      message: `${req.method} ${url} -> ${reply.statusCode} (${duration}ms)`,
      data
    })
    done()
  })

  app.addHook('onError', (req, reply, error, done) => {
    if (!shouldSkipLog(req)) {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'error',
        source: 'http',
        message: `${req.method} ${req.url} -> error`,
        data: sanitize({ error: error?.message ?? error })
      })
    }
    done()
  })

  await app.register(fastifyWebsocket)

  const sendUi = async (_req: FastifyRequest, reply: FastifyReply) => {
    const raw = readAsset('ui.html', prefix)
    if (!raw) {
      const tried = resolveAssetCandidates('ui.html', prefix).join(', ')
      reply.code(404).send(`ui.html not found. Tried: ${tried}`)
      return
    }
    const html = raw.replace(/__MONIT_BASE__/g, prefix)
    reply.header('Cache-Control', 'no-store')
    reply.type('text/html').send(html)
  }

  app.get(prefix, sendUi)
  app.get(`${prefix}/`, sendUi)
  app.get(`${prefix}/ui.css`, async (_req, reply) => {
    const css = readAsset('ui.css', prefix)
    if (!css) {
      const tried = resolveAssetCandidates('ui.css', prefix).join(', ')
      reply.code(404).send(`ui.css not found. Tried: ${tried}`)
      return
    }
    reply.header('Cache-Control', 'no-store')
    reply.type('text/css').send(css)
  })
  app.get(`${prefix}/ui.js`, async (_req, reply) => {
    const raw = readAsset('ui.js', prefix)
    if (!raw) {
      const tried = resolveAssetCandidates('ui.js', prefix).join(', ')
      reply.code(404).send(`ui.js not found. Tried: ${tried}`)
      return
    }
    const js = raw.replace(/__MONIT_BASE__/g, prefix)
    reply.header('Cache-Control', 'no-store')
    reply.type('application/javascript').send(js)
  })

  app.get(`${prefix}/ws`, { websocket: true }, (connection) => {
    const socket =
      (connection as {
        socket?: { send: (data: string) => void; readyState: number; on: Function }
      }).socket ?? (connection as { send: (data: string) => void; readyState: number; on: Function })
    clients.add(socket)
    socket.send(JSON.stringify({ type: 'init', events: eventStore.list({ limit: maxEvents }) }))
    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'log',
      source: 'monit',
      message: 'websocket connected'
    })
    socket.on('close', () => {
      clients.delete(socket)
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'log',
        source: 'monit',
        message: 'websocket disconnected'
      })
    })
  })

  registerEventsRoutes(app, { prefix, eventStore, getStats })
  registerTriggerRoutes(app, { prefix })
  registerFunctionRoutes(app, {
    prefix,
    allowEdit,
    allowInvoke,
    maxHistory,
    addFunctionHistory,
    functionHistory,
    addEvent
  })
  registerUserRoutes(app, { prefix, addEvent })
  registerCollectionRoutes(app, {
    prefix,
    collectionHistory,
    maxCollectionHistory,
    addCollectionHistory
  })
}, { name: 'monitoring' })

export default createMonitoringPlugin
