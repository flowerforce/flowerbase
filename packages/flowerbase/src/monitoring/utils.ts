import fs from 'node:fs'
import path from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { ObjectId } from 'mongodb'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../constants'
import type { Rules } from '../features/rules/interface'
import { getValidRule } from '../services/mongodb-atlas/utils'
import { checkApplyWhen } from '../utils/roles/machines/utils'

export type MonitorEvent = {
  id: string
  ts: number
  type: string
  source?: string
  message: string
  data?: unknown
}

export type FunctionHistoryItem = {
  ts: number
  name: string
  args: unknown[]
  runAsSystem: boolean
  user?: { id?: string; email?: string }
  code?: string
  codeModified?: boolean
}

export type CollectionHistoryItem = {
  ts: number
  collection: string
  mode: 'query' | 'aggregate'
  query?: unknown
  pipeline?: unknown
  sort?: Record<string, unknown>
  runAsSystem: boolean
  user?: { id?: string; email?: string }
  page?: number
}

export type EventQuery = {
  q?: string
  type?: string
  limit?: number
}

export type EventStore = {
  add: (event: MonitorEvent) => void
  list: (query?: EventQuery) => MonitorEvent[]
  clear: () => void
}

export type MonitMeta = {
  serviceName: string
  rules?: Rules
  user?: unknown
  runAsSystem?: boolean
  dbName?: string
  collection?: string
}

export const DAY_MS = 24 * 60 * 60 * 1000
export const MAX_DEPTH = 15
export const MAX_ARRAY = 50
export const MAX_STRING = 500
export const COLLECTION_PAGE_SIZE = 50

export const isTestEnv = () =>
  process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

export const isPromiseLike = (value: unknown): value is Promise<unknown> =>
  !!value && typeof value === 'object' && typeof (value as { then?: unknown }).then === 'function'

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const safeStringify = (value: unknown) => {
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

export const redactString = (value: string) => {
  let result = value
  result = result.replace(/(Bearer|Basic)\s+[A-Za-z0-9._+\\/=-]+/gi, '$1 [redacted]')
  result = result.replace(
    /(password|pass|pwd|secret|token|api[_-]?key|access[_-]?key|refresh[_-]?token)\s*[=:]\s*[^\s,;]+/gi,
    '$1=[redacted]'
  )
  if (result.length > MAX_STRING) {
    result = result.slice(0, MAX_STRING) + '...[truncated]'
  }
  return result
}

export const stripSensitiveFields = (value: Record<string, unknown>) => {
  const out: Record<string, unknown> = {}
  Object.keys(value).forEach((key) => {
    if (SENSITIVE_KEYS.some((re) => re.test(key))) return
    out[key] = value[key]
  })
  return out
}

export const isErrorLike = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== 'object') return false
  if (value instanceof Error) return true
  const record = value as Record<string, unknown>
  return (
    typeof record.message === 'string' ||
    typeof record.stack === 'string' ||
    typeof record.name === 'string'
  )
}

export const sanitizeErrorLike = (value: Record<string, unknown>, depth: number): Record<string, unknown> => {
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

export const sanitize = (value: unknown, depth = 0): unknown => {
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

export const getErrorDetails = (error: unknown) => {
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

export const pickHeaders = (headers: FastifyRequest['headers']) => {
  const keys = ['user-agent', 'content-type', 'x-forwarded-for', 'host', 'origin', 'referer']
  const picked: Record<string, unknown> = {}
  keys.forEach((key) => {
    const value = headers[key]
    if (value) picked[key] = value
  })
  return sanitize(picked)
}

export const createEventStore = (maxAgeMs: number, maxEvents: number): EventStore => {
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

export const classifyRequest = (url: string) => {
  if (url.includes('/auth') || url.includes('/login') || url.includes('/register') || url.includes('/logout')) {
    return 'auth'
  }
  if (url.includes('/functions')) return 'function'
  if (url.includes('/endpoint/')) return 'http_endpoint'
  if (url.includes('/triggers')) return 'trigger'
  if (url.includes('/api/')) return 'api'
  return 'http'
}

export const createEventId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const buildRulesMeta = (meta?: MonitMeta) => {
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

export const buildCollectionRulesSnapshot = (
  rules: Rules | undefined,
  collection: string,
  user?: unknown,
  runAsSystem?: boolean
) => {
  const collectionRules = rules?.[collection]
  return collectionRules ?? null
}

export const resolveAssetCandidates = (filename: string, prefix: string) => {
  const rootDir = process.cwd()
  const cleanPrefix = prefix.replace(/^\/+/g, '').replace(/\/+$/, '')
  const candidates: string[] = []
  const addCandidate = (candidate: string) => {
    if (!candidates.includes(candidate)) candidates.push(candidate)
  }

  if (cleanPrefix) {
    addCandidate(path.join(rootDir, cleanPrefix, filename))
  }
  addCandidate(path.join(rootDir, 'monitoring', filename))

  addCandidate(path.join(__dirname, filename))
  addCandidate(path.join(__dirname, '..', '..', 'src', 'monitoring', filename))

  return candidates
}

export const readAsset = (filename: string, prefix: string) => {
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

export const resolveUserContext = async (
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

export const getUserInfo = (resolvedUser?: Record<string, unknown>) => {
  if (!resolvedUser || typeof resolvedUser !== 'object') return undefined
  const record = resolvedUser as {
    id?: unknown
    email?: unknown
    user_data?: { email?: unknown }
  }
  const id = typeof record.id === 'string' ? record.id : undefined
  const email = typeof record.email === 'string'
    ? record.email
    : (typeof record.user_data?.email === 'string' ? record.user_data.email : undefined)
  if (!id && !email) return undefined
  return { id, email }
}
