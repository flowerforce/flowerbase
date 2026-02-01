import fp from 'fastify-plugin'
import fastifyWebsocket from '@fastify/websocket'
import '@fastify/websocket'
import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { ObjectId } from 'mongodb'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../constants'
import { services as coreServices } from '../services'
import { StateManager } from '../state'
import handleUserRegistration from '../shared/handleUserRegistration'
import { PROVIDER } from '../shared/models/handleUserRegistration.model'
import { hashPassword } from '../utils/crypto'
import { GenerateContext } from '../utils/context'
import type { Rules } from '../features/rules/interface'
import { getValidRule } from '../services/mongodb-atlas/utils'
import { checkApplyWhen } from '../utils/roles/machines/utils'

type MonitorEvent = {
  id: string
  ts: number
  type: string
  source?: string
  message: string
  data?: unknown
}

type FunctionHistoryItem = {
  ts: number
  name: string
  args: unknown[]
  runAsSystem: boolean
  user?: { id?: string; email?: string }
}

type EventQuery = {
  q?: string
  type?: string
  limit?: number
}

type EventStore = {
  add: (event: MonitorEvent) => void
  list: (query?: EventQuery) => MonitorEvent[]
  clear: () => void
}

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_DEPTH = 6
const MAX_ARRAY = 50
const MAX_STRING = 500
const MONIT_REALM = 'Flowerbase Monitor'

const isTestEnv = () =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function'

const safeStringify = (value: unknown) => {
  const seen = new WeakSet<object>()
  try {
    return JSON.stringify(value, (key, val) => {
      if (typeof val === 'bigint') return val.toString()
      if (val && typeof val === 'object') {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
      }
      return val
    })
  } catch {
    return String(value)
  }
}

const SENSITIVE_KEYS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /authorization/i,
  /cookie/i,
  /api[-_]?key/i,
  /access[-_]?key/i,
  /refresh[-_]?token/i,
  /signature/i,
  /private/i
]

const redactString = (value: string) => {
  let result = value
  result = result.replace(/(Bearer|Basic)\s+[A-Za-z0-9._+\\/=-]+/gi, '$1 [redacted]')
  result = result.replace(
    /(password|pass|pwd|secret|token|api[_-]?key|access[_-]?key|refresh[_-]?token)\s*[=:]\s*[^\\s,;]+/gi,
    '$1=[redacted]'
  )
  if (result.length > MAX_STRING) {
    result = result.slice(0, MAX_STRING) + '...[truncated]'
  }
  return result
}

const stripSensitiveFields = (value: Record<string, unknown>) => {
  const out: Record<string, unknown> = {}
  Object.keys(value).forEach((key) => {
    if (SENSITIVE_KEYS.some((re) => re.test(key))) return
    out[key] = value[key]
  })
  return out
}

const isErrorLike = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false
  if (value instanceof Error) return true
  const record = value as Record<string, unknown>
  return (
    typeof record.message === 'string' ||
    typeof record.stack === 'string' ||
    typeof record.name === 'string'
  )
}

const sanitizeErrorLike = (value: Record<string, unknown>, depth: number): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  const names = new Set<string>(Object.getOwnPropertyNames(value))
    ;['name', 'message', 'stack', 'code', 'statusCode', 'cause'].forEach((key) => names.add(key))

  names.forEach((key) => {
    if (SENSITIVE_KEYS.some((re) => re.test(key))) {
      out[key] = '[redacted]'
      return
    }
    const raw = value[key]
    if (raw === value) {
      out[key] = '[Circular]'
      return
    }
    if ((key === 'message' || key === 'stack') && typeof raw === 'string') {
      out[key] = DEFAULT_CONFIG.MONIT_REDACT_ERROR_DETAILS ? redactString(raw) : raw
      return
    }
    if (typeof raw === 'string') {
      out[key] = redactString(raw)
      return
    }
    if (raw !== undefined) {
      out[key] = sanitize(raw, depth + 1)
    }
  })

  if (value instanceof Error) {
    if (!out.name) out.name = value.name
    if (!out.message) {
      out.message = DEFAULT_CONFIG.MONIT_REDACT_ERROR_DETAILS ? redactString(value.message) : value.message
    }
    if (!out.stack && value.stack) {
      out.stack = DEFAULT_CONFIG.MONIT_REDACT_ERROR_DETAILS ? redactString(value.stack) : value.stack
    }
  }

  return out
}

const getErrorDetails = (error: unknown) => {
  if (isErrorLike(error)) {
    const sanitized = sanitizeErrorLike(error as Record<string, unknown>, 0)
    const message =
      typeof sanitized.message === 'string' && sanitized.message
        ? sanitized.message
        : typeof sanitized.name === 'string' && sanitized.name
          ? sanitized.name
          : safeStringify(error)
    const stack = typeof sanitized.stack === 'string' ? sanitized.stack : undefined
    return { message, stack }
  }
  if (typeof error === 'string') return { message: error }
  return { message: safeStringify(error) }
}

const sanitize = (value: unknown, depth = 0): unknown => {
  if (depth > MAX_DEPTH) return '[max-depth]'
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (Buffer.isBuffer(value)) return `[buffer ${value.length} bytes]`
  if (isErrorLike(value)) {
    return sanitizeErrorLike(value as Record<string, unknown>, depth)
  }
  if (typeof value === 'object') {
    const maybeObjectId = value as { _bsontype?: string; toString?: () => string }
    if (maybeObjectId?._bsontype === 'ObjectId' && typeof maybeObjectId.toString === 'function') {
      return maybeObjectId.toString()
    }
  }
  if (typeof value === 'string') return redactString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1))
    if (value.length > MAX_ARRAY) {
      items.push(`[+${value.length - MAX_ARRAY} items]`)
    }
    return items
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    Object.keys(obj).forEach((key) => {
      if (SENSITIVE_KEYS.some((re) => re.test(key))) {
        out[key] = '[redacted]'
        return
      }
      out[key] = sanitize(obj[key], depth + 1)
    })
    return out
  }
  return value
}

const pickHeaders = (headers: FastifyRequest['headers']) => {
  const keys = ['user-agent', 'content-type', 'x-forwarded-for', 'host', 'origin', 'referer']
  const picked: Record<string, unknown> = {}
  keys.forEach((key) => {
    const value = headers[key]
    if (value) picked[key] = value
  })
  return sanitize(picked)
}

const createEventStore = (maxAgeMs: number, maxEvents: number): EventStore => {
  const events: MonitorEvent[] = []

  const trim = () => {
    const cutoff = Date.now() - maxAgeMs
    while (events.length && events[0].ts < cutoff) {
      events.shift()
    }
    if (events.length > maxEvents) {
      events.splice(0, events.length - maxEvents)
    }
  }

  return {
    add(event) {
      events.push(event)
      trim()
    },
    list(query) {
      trim()
      let result = events.slice()
      if (query?.type) {
        result = result.filter((event) => event.type === query.type)
      }
      if (query?.q) {
        const q = query.q.toLowerCase()
        result = result.filter((event) => safeStringify(event).toLowerCase().includes(q))
      }
      if (query?.limit && query.limit > 0) {
        result = result.slice(-query.limit)
      }
      return result
    },
    clear() {
      events.length = 0
    }
  }
}

const classifyRequest = (url: string) => {
  if (url.includes('/auth') || url.includes('/login') || url.includes('/register') || url.includes('/logout')) {
    return 'auth'
  }
  if (url.includes('/functions')) return 'function'
  if (url.includes('/endpoint/')) return 'http_endpoint'
  if (url.includes('/triggers')) return 'trigger'
  if (url.includes('/api/')) return 'api'
  return 'http'
}

const createEventId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

type MonitMeta = {
  serviceName: string
  rules?: Rules
  user?: unknown
  runAsSystem?: boolean
  dbName?: string
  collection?: string
}

const buildRulesMeta = (meta?: MonitMeta) => {
  if (!meta || meta.serviceName !== 'mongodb-atlas' || !meta.collection || !meta.rules) {
    return undefined
  }
  const collectionRules = meta.rules[meta.collection]
  if (!collectionRules) {
    return { collection: meta.collection, roles: [], filters: [] }
  }
  const filters = collectionRules.filters ?? []
  const roles = collectionRules.roles ?? []
  const user = (meta.user ?? {}) as Parameters<typeof getValidRule>[0]['user']
  const matchedFilters = getValidRule({ filters, user })
  const matchedFilterNames = matchedFilters.map((filter) => filter.name)
  const matchedFilterQueries = matchedFilters.map((filter) => filter.query)
  const roleCandidates = roles
    .filter((role) => checkApplyWhen(role.apply_when, user as never, null))
    .map((role) => role.name)

  return {
    collection: meta.collection,
    roles: roles.map((role) => role.name),
    roleCandidates,
    filters: filters.map((filter) => filter.name),
    matchedFilters: matchedFilterNames,
    matchedFilterQueries,
    runAsSystem: !!meta.runAsSystem
  }
}

const resolveAssetCandidates = (filename: string, prefix: string) => {
  const rootDir = process.cwd()
  const cleanPrefix = prefix.replace(/^\/+/, '').replace(/\/+$/, '')
  const candidates: string[] = []
  const addCandidate = (candidate: string) => {
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }

  if (cleanPrefix) {
    addCandidate(path.join(rootDir, cleanPrefix, filename))
  }
  addCandidate(path.join(rootDir, 'monitoring', filename))

  // Fallbacks: try package-local assets (works in dev and when bundled).
  addCandidate(path.join(__dirname, filename))
  addCandidate(path.join(__dirname, '..', '..', 'src', 'monitoring', filename))

  return candidates
}

const resolveUserContext = async (
  app: FastifyInstance,
  userId?: string,
  userPayload?: Record<string, unknown>
) => {
  if (userPayload && typeof userPayload === 'object') {
    return stripSensitiveFields(userPayload)
  }
  if (!userId) return undefined
  const normalizedUserId = userId.trim()

  const db = app.mongo.client.db(DB_NAME)
  const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
  const userCollection = AUTH_CONFIG.userCollection
  const userIdField = AUTH_CONFIG.user_id_field ?? 'id'
  const isObjectId = ObjectId.isValid(normalizedUserId)
  const authSelector = isObjectId
    ? { _id: new ObjectId(normalizedUserId) }
    : { id: normalizedUserId }
  const authUser = await db.collection(authCollection).findOne(authSelector)

  let customUser: Record<string, unknown> | null = null
  if (userCollection) {
    const customSelector = { [userIdField]: normalizedUserId }
    customUser = await db.collection(userCollection).findOne(customSelector)
    if (!customUser && isObjectId) {
      customUser = await db.collection(userCollection).findOne({ _id: new ObjectId(normalizedUserId) })
    }
  }

  const id =
    authUser && typeof (authUser as { _id?: unknown })._id !== 'undefined'
      ? String((authUser as { _id?: ObjectId })._id)
      : (customUser && typeof customUser[userIdField] !== 'undefined'
        ? String(customUser[userIdField])
        : normalizedUserId)

  const user_data = {
    ...(customUser ? stripSensitiveFields(customUser) : {}),
    id,
    _id: id,
    email: authUser && typeof (authUser as { email?: unknown }).email === 'string'
      ? (authUser as { email?: string }).email
      : undefined
  }

  const user: Record<string, unknown> = {
    id,
    user_data,
    data: user_data,
    custom_data: user_data
  }

  if (isObjectId) {
    user._id = new ObjectId(id)
  }

  return user
}

const readAsset = (filename: string, prefix: string) => {
  const candidates = resolveAssetCandidates(filename, prefix)
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return fs.readFileSync(candidate, 'utf8')
      }
    } catch {
      // ignore and try next
    }
  }
  return ''
}

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
    'mongodb-atlas': 'rules'
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
          const fnPath = `${path}.${String(prop)}`
          const wrappedFn = (...args: unknown[]) => {
            let nextMeta = meta
            if (serviceName === 'mongodb-atlas') {
              if (prop === 'db' && typeof args[0] === 'string') {
                nextMeta = { ...(meta ?? { serviceName }), dbName: args[0], serviceName }
              }
              if (prop === 'collection' && typeof args[0] === 'string') {
                nextMeta = {
                  ...(meta ?? { serviceName }),
                  collection: args[0],
                  serviceName
                }
              }
            }
            const shouldLog =
              serviceName !== 'mongodb-atlas' ||
              (!['db', 'collection'].includes(String(prop)))
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
              return result.catch((error) => {
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
      const instance = original(app, options)
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

  const eventStore = createEventStore(maxAgeMs || DAY_MS, maxEvents)
  const functionHistory: FunctionHistoryItem[] = []
  const maxHistory = 30
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
      message: redactString(event.message)
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
    DEFAULT_CONFIG.MONIT_USER && DEFAULT_CONFIG.MONIT_PASSWORD

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
    ; (req as { __monitStart?: number }).__monitStart = Date.now()
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
      (connection as { socket?: { send: (data: string) => void; readyState: number; on: Function } })
        .socket ?? (connection as { send: (data: string) => void; readyState: number; on: Function })
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

  app.get(`${prefix}/api/events`, async (req) => {
    const query = req.query as { q?: string; type?: string; limit?: string }
    const limit = query.limit ? Number(query.limit) : undefined
    return {
      items: eventStore.list({
        q: query.q,
        type: query.type,
        limit
      })
    }
  })

  app.get(`${prefix}/api/stats`, async () => getStats())

  app.get(`${prefix}/api/functions`, async () => {
    const functionsList = StateManager.select('functions') as Record<string, { private?: boolean }>
    const items = Object.keys(functionsList || {}).map((name) => ({
      name,
      private: !!functionsList[name]?.private,
      run_as_system: !!(functionsList[name] as { run_as_system?: boolean })?.run_as_system
    }))
    return { items }
  })

  app.get(`${prefix}/api/functions/:name`, async (req, reply) => {
    if (!allowEdit) {
      reply.code(403)
      return { error: 'Function code access disabled' }
    }
    const params = req.params as { name: string }
    const name = params.name
    const functionsList = StateManager.select('functions') as Record<
      string,
      { code?: string; private?: boolean; run_as_system?: boolean; disable_arg_logs?: boolean }
    >
    const currentFunction = functionsList?.[name]
    if (!currentFunction) {
      reply.code(404)
      return { error: `Function "${name}" not found` }
    }
    return {
      name,
      code: currentFunction.code ?? '',
      private: !!currentFunction.private,
      run_as_system: !!currentFunction.run_as_system,
      disable_arg_logs: !!currentFunction.disable_arg_logs
    }
  })

  app.get(`${prefix}/api/functions/history`, async () => ({
    items: functionHistory.slice(0, maxHistory)
  }))

  app.post(`${prefix}/api/functions/invoke`, async (req, reply) => {
    if (!allowInvoke) {
      reply.code(403)
      return { error: 'Function invocation disabled' }
    }
    const body = req.body as {
      name?: string
      arguments?: unknown[]
      runAsSystem?: boolean
      userId?: string
      user?: Record<string, unknown>
      code?: string
    }
    const name = body?.name
    const args = Array.isArray(body?.arguments) ? body.arguments : []
    if (!name) {
      reply.code(400)
      return { error: 'Missing function name' }
    }
    const functionsList = StateManager.select('functions') as Record<string, { code: string }>
    const rules = StateManager.select('rules') as Rules
    const appRef = StateManager.select('app') as FastifyInstance
    const services = StateManager.select('services') as typeof coreServices
    const currentFunction = functionsList?.[name]
    if (!currentFunction) {
      reply.code(404)
      return { error: `Function "${name}" not found` }
    }
    if (!allowEdit && typeof body?.code === 'string' && body.code.trim()) {
      reply.code(403)
      return { error: 'Function override disabled' }
    }
    const overrideCode =
      typeof body?.code === 'string' && body.code.trim()
        ? body.code
        : undefined
    const effectiveRunAsSystem = body?.runAsSystem !== false
    const effectiveFunction = overrideCode
      ? { ...currentFunction, code: overrideCode, run_as_system: effectiveRunAsSystem }
      : { ...currentFunction, run_as_system: effectiveRunAsSystem }

    const resolvedUser = await resolveUserContext(app, body?.userId, body?.user)
    const safeArgs = (Array.isArray(args) ? sanitize(args) : sanitize([args])) as unknown[]
    const resolvedUserRecord = resolvedUser as {
      id?: unknown
      email?: unknown
      user_data?: { email?: unknown }
    } | undefined
    const userInfo = resolvedUserRecord
      ? {
        id: typeof resolvedUserRecord.id === 'string' ? resolvedUserRecord.id : undefined,
        email: typeof resolvedUserRecord.email === 'string'
          ? resolvedUserRecord.email
          : (typeof resolvedUserRecord.user_data?.email === 'string'
            ? resolvedUserRecord.user_data?.email
            : undefined)
      }
      : undefined
    addFunctionHistory({
      ts: Date.now(),
      name,
      args: safeArgs,
      runAsSystem: effectiveRunAsSystem,
      user: userInfo
    })

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'function',
      source: 'monit',
      message: `invoke ${name}`,
      data: sanitize({
        args,
        user: userInfo,
        runAsSystem: effectiveRunAsSystem,
        override: Boolean(overrideCode)
      })
    })

    try {
      const result = await GenerateContext({
        args,
        app: appRef,
        rules,
        user: resolvedUser ?? { id: 'monitor', role: 'system' },
        currentFunction: effectiveFunction,
        functionsList,
        services,
        runAsSystem: effectiveRunAsSystem
      })
      return { result: sanitize(result) }
    } catch (error) {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'error',
        source: 'monit',
        message: `invoke ${name} failed`,
        data: sanitize({ error })
      })
      reply.code(500)
      const details = getErrorDetails(error)
      return { error: details.message, stack: details.stack }
    }
  })

  app.get(`${prefix}/api/users`, async (req) => {
    const query = req.query as {
      scope?: string
      limit?: string
      authLimit?: string
      customLimit?: string
      customPage?: string
      page?: string
      q?: string
    }
    const scope = query.scope ?? 'all'
    const rawSearch = typeof query.q === 'string' ? query.q.trim() : ''
    const hasSearch = rawSearch.length > 0
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const searchRegex = hasSearch ? new RegExp(escapeRegex(rawSearch), 'i') : null
    const searchObjectId = hasSearch && ObjectId.isValid(rawSearch) ? new ObjectId(rawSearch) : null
    const parsedAuthLimit = Number(query.authLimit ?? query.limit ?? 100)
    const parsedCustomLimit = Number(query.customLimit ?? query.limit ?? 25)
    const parsedPage = Number(query.customPage ?? query.page ?? 1)
    const resolvedAuthLimit = Math.min(Number.isFinite(parsedAuthLimit) && parsedAuthLimit > 0 ? parsedAuthLimit : 100, 500)
    const resolvedCustomLimit = Math.min(Number.isFinite(parsedCustomLimit) && parsedCustomLimit > 0 ? parsedCustomLimit : 25, 500)
    const resolvedCustomPage = Math.max(Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1, 1)
    const db = app.mongo.client.db(DB_NAME)
    const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
    const userCollection = AUTH_CONFIG.userCollection

    const response: Record<string, unknown> = {
      meta: {
        userIdField: AUTH_CONFIG.user_id_field,
        authCollection,
        customCollection: userCollection
      }
    }

    if (scope === 'all' || scope === 'auth') {
      const authFilter = hasSearch
        ? {
          $or: [
            ...(searchObjectId ? [{ _id: searchObjectId }] : []),
            { email: searchRegex },
            { status: searchRegex }
          ]
        }
        : {}
      const authItems = await db
        .collection(authCollection)
        .find(authFilter)
        .sort({ createdAt: -1 })
        .limit(resolvedAuthLimit)
        .toArray()
      response.auth = {
        collection: authCollection,
        items: authItems.map((doc) => sanitize(doc))
      }
    }

    if ((scope === 'all' || scope === 'custom') && userCollection) {
      const userIdField = AUTH_CONFIG.user_id_field ?? 'id'
      const customFilter = hasSearch
        ? {
          $or: [
            ...(searchObjectId ? [{ _id: searchObjectId }] : []),
            { [userIdField]: searchRegex },
            { email: searchRegex },
            { name: searchRegex },
            { username: searchRegex }
          ]
        }
        : {}
      const total = await db.collection(userCollection).countDocuments(customFilter)
      const totalPages = Math.max(1, Math.ceil(total / Math.max(resolvedCustomLimit, 1)))
      const page = Math.min(resolvedCustomPage, totalPages)
      const skip = Math.max(0, (page - 1) * resolvedCustomLimit)
      const customItems = await db
        .collection(userCollection)
        .find(customFilter)
        .skip(skip)
        .limit(resolvedCustomLimit)
        .toArray()
      response.custom = {
        collection: userCollection,
        items: customItems.map((doc) => sanitize(doc)),
        pagination: {
          page,
          pages: totalPages,
          total,
          pageSize: resolvedCustomLimit
        }
      }
    }

    return response
  })

  app.post(`${prefix}/api/users`, async (req, reply) => {
    const body = req.body as { email?: string; password?: string; customData?: Record<string, unknown> }
    const email = body?.email?.toLowerCase()
    const password = body?.password
    if (!email || !password) {
      reply.code(400)
      return { error: 'Missing email or password' }
    }

    const result = await handleUserRegistration(app, {
      run_as_system: true,
      provider: PROVIDER.LOCAL_USERPASS
    })({ email, password })

    const userId = result?.insertedId?.toString()

    if (userId && AUTH_CONFIG.userCollection && AUTH_CONFIG.user_id_field) {
      const db = app.mongo.client.db(DB_NAME)
      const customData = body?.customData ?? {}
      await db.collection(AUTH_CONFIG.userCollection).updateOne(
        { [AUTH_CONFIG.user_id_field]: userId },
        {
          $set: {
            ...customData,
            [AUTH_CONFIG.user_id_field]: userId
          }
        },
        { upsert: true }
      )
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'auth',
      source: 'monit',
      message: 'user created',
      data: sanitize({ email, userId })
    })

    reply.code(201)
    return { userId }
  })

  app.patch(`${prefix}/api/users/:id/password`, async (req, reply) => {
    const params = req.params as { id: string }
    const body = req.body as { password?: string; email?: string }
    const password = body?.password
    if (!password) {
      reply.code(400)
      return { error: 'Missing password' }
    }

    const db = app.mongo.client.db(DB_NAME)
    const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
    const selector: Record<string, unknown> = {}

    if (params.id && ObjectId.isValid(params.id)) {
      selector._id = new ObjectId(params.id)
    } else if (body?.email) {
      selector.email = body.email.toLowerCase()
    } else {
      reply.code(400)
      return { error: 'Invalid user identifier' }
    }

    const hashedPassword = await hashPassword(password)
    const result = await db.collection(authCollection).updateOne(selector, {
      $set: { password: hashedPassword }
    })

    if (!result.matchedCount) {
      reply.code(404)
      return { error: 'User not found' }
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'auth',
      source: 'monit',
      message: 'password updated',
      data: sanitize({ selector })
    })

    return { status: 'ok' }
  })

  app.patch(`${prefix}/api/users/:id/status`, async (req, reply) => {
    const params = req.params as { id: string }
    const body = req.body as { disabled?: boolean; status?: string; email?: string }
    const db = app.mongo.client.db(DB_NAME)
    const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
    const selector: Record<string, unknown> = {}

    if (params.id && ObjectId.isValid(params.id)) {
      selector._id = new ObjectId(params.id)
    } else if (body?.email) {
      selector.email = body.email.toLowerCase()
    } else {
      reply.code(400)
      return { error: 'Invalid user identifier' }
    }

    const status = typeof body?.disabled === 'boolean'
      ? (body.disabled ? 'disabled' : 'confirmed')
      : (body?.status ?? 'disabled')

    const result = await db.collection(authCollection).updateOne(selector, {
      $set: { status }
    })

    if (!result.matchedCount) {
      reply.code(404)
      return { error: 'User not found' }
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'auth',
      source: 'monit',
      message: `user status ${status}`,
      data: sanitize({ selector, status })
    })

    return { status: 'ok' }
  })
}, { name: 'monitoring' })

export default createMonitoringPlugin
