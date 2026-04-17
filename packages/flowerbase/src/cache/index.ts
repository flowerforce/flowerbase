import { createHash } from 'node:crypto'
import { EJSON } from 'bson'

type CacheEntryOptions = {
  tags?: string[]
  ttlSeconds?: number
}

export type CacheProviderKind = 'none' | 'memory' | 'redis'

export type CacheProvider = {
  kind: CacheProviderKind
  get: <T>(key: string) => Promise<T | undefined>
  set: <T>(key: string, value: T, options?: CacheEntryOptions) => Promise<void>
  invalidateTags: (tags: string[]) => Promise<void>
  close: () => Promise<void>
}

export type MemoryCacheConfig = {
  provider: 'memory'
  defaultTtlSeconds?: number
  maxEntries?: number
  keyPrefix?: string
}

export type RedisCacheConfig = {
  provider: 'redis'
  url: string
  defaultTtlSeconds?: number
  keyPrefix?: string
}

export type CacheConfig = MemoryCacheConfig | RedisCacheConfig

type MemoryEntry = {
  value: string
  expiresAt?: number
  tags: string[]
}

type RedisClientLike = {
  connect: () => Promise<void>
  quit: () => Promise<void>
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, options?: Record<string, unknown>) => Promise<unknown>
  del: (...keys: string[]) => Promise<unknown>
  sAdd: (key: string, members: string | string[]) => Promise<unknown>
  sMembers: (key: string) => Promise<string[]>
}

const DEFAULT_KEY_PREFIX = 'flowerbase:cache'

const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string
) => Promise<Record<string, unknown>>

const toStableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toStableValue(item))
  }

  if (!value || typeof value !== 'object') return value

  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) {
    return value
  }

  const sortedEntries = Object.entries(value).sort(([left], [right]) =>
    left.localeCompare(right)
  )

  return sortedEntries.reduce<Record<string, unknown>>((acc, [key, current]) => {
    acc[key] = toStableValue(current)
    return acc
  }, {})
}

const serializeValue = (value: unknown) =>
  JSON.stringify(EJSON.serialize(value, { relaxed: false }))

const deserializeValue = <T>(value: string): T =>
  EJSON.deserialize(JSON.parse(value)) as T

const normalizeTags = (tags?: string[]) =>
  [...new Set((tags ?? []).filter((tag): tag is string => typeof tag === 'string'))]

const createPrefixedKey = (prefix: string, kind: 'entry' | 'tag', value: string) =>
  `${prefix}:${kind}:${value}`

const getExpiresAt = (ttlSeconds?: number) =>
  typeof ttlSeconds === 'number' && ttlSeconds > 0
    ? Date.now() + ttlSeconds * 1000
    : undefined

const addKeyToTagsIndex = (
  tagsIndex: Map<string, Set<string>>,
  key: string,
  tags: string[]
) => {
  tags.forEach((tag) => {
    const existingKeys = tagsIndex.get(tag) ?? new Set<string>()
    existingKeys.add(key)
    tagsIndex.set(tag, existingKeys)
  })
}

const removeKeyFromTagsIndex = (
  tagsIndex: Map<string, Set<string>>,
  key: string,
  tags: string[]
) => {
  tags.forEach((tag) => {
    const existingKeys = tagsIndex.get(tag)
    if (!existingKeys) return
    existingKeys.delete(key)
    if (!existingKeys.size) {
      tagsIndex.delete(tag)
    }
  })
}

const createMemoryCacheProvider = (
  config: MemoryCacheConfig
): CacheProvider => {
  const entries = new Map<string, MemoryEntry>()
  const tagsIndex = new Map<string, Set<string>>()
  const defaultTtlSeconds = config.defaultTtlSeconds
  const maxEntries =
    typeof config.maxEntries === 'number' && config.maxEntries > 0
      ? Math.floor(config.maxEntries)
      : undefined

  const clearEntry = (key: string) => {
    const currentEntry = entries.get(key)
    if (!currentEntry) return
    removeKeyFromTagsIndex(tagsIndex, key, currentEntry.tags)
    entries.delete(key)
  }

  const touchEntry = (key: string, entry: MemoryEntry) => {
    entries.delete(key)
    entries.set(key, entry)
  }

  const evictLeastRecentlyUsedEntry = () => {
    if (typeof maxEntries !== 'number' || entries.size < maxEntries) return
    const oldestKey = entries.keys().next().value as string | undefined
    if (!oldestKey) return
    clearEntry(oldestKey)
  }

  return {
    kind: 'memory',
    get: async <T>(key: string) => {
      const entry = entries.get(key)
      if (!entry) return undefined

      if (entry.expiresAt && entry.expiresAt <= Date.now()) {
        clearEntry(key)
        return undefined
      }

      touchEntry(key, entry)
      return deserializeValue<T>(entry.value)
    },
    set: async <T>(key: string, value: T, options?: CacheEntryOptions) => {
      clearEntry(key)
      evictLeastRecentlyUsedEntry()

      const tags = normalizeTags(options?.tags)
      const entry: MemoryEntry = {
        value: serializeValue(value),
        expiresAt: getExpiresAt(options?.ttlSeconds ?? defaultTtlSeconds),
        tags
      }

      entries.set(key, entry)
      addKeyToTagsIndex(tagsIndex, key, tags)
    },
    invalidateTags: async (tags: string[]) => {
      tags.forEach((tag) => {
        const keys = [...(tagsIndex.get(tag) ?? new Set<string>())]
        keys.forEach((key) => clearEntry(key))
      })
    },
    close: async () => {
      entries.clear()
      tagsIndex.clear()
    }
  }
}

const createRedisCacheProvider = async (
  config: RedisCacheConfig
): Promise<CacheProvider> => {
  const redisModule = await dynamicImport('redis')
  const createClient = redisModule.createClient as
    | ((options: Record<string, unknown>) => RedisClientLike)
    | undefined

  if (typeof createClient !== 'function') {
    throw new Error('Redis client module does not expose createClient')
  }

  const keyPrefix = config.keyPrefix ?? DEFAULT_KEY_PREFIX
  const defaultTtlSeconds = config.defaultTtlSeconds
  const client = createClient({ url: config.url })
  await client.connect()

  return {
    kind: 'redis',
    get: async <T>(key: string) => {
      const value = await client.get(createPrefixedKey(keyPrefix, 'entry', key))
      if (value === null) return undefined
      return deserializeValue<T>(value)
    },
    set: async <T>(key: string, value: T, options?: CacheEntryOptions) => {
      const entryKey = createPrefixedKey(keyPrefix, 'entry', key)
      const ttlSeconds = options?.ttlSeconds ?? defaultTtlSeconds
      const payload = serializeValue(value)

      if (typeof ttlSeconds === 'number' && ttlSeconds > 0) {
        await client.set(entryKey, payload, { EX: ttlSeconds })
      } else {
        await client.set(entryKey, payload)
      }

      const tags = normalizeTags(options?.tags)
      await Promise.all(
        tags.map((tag) =>
          client.sAdd(createPrefixedKey(keyPrefix, 'tag', tag), entryKey)
        )
      )
    },
    invalidateTags: async (tags: string[]) => {
      for (const tag of tags) {
        const tagKey = createPrefixedKey(keyPrefix, 'tag', tag)
        const entryKeys = await client.sMembers(tagKey)
        if (entryKeys.length) {
          await client.del(...entryKeys)
        }
        await client.del(tagKey)
      }
    },
    close: async () => {
      await client.quit()
    }
  }
}

export const noopCacheProvider: CacheProvider = {
  kind: 'none',
  get: async () => undefined,
  set: async () => undefined,
  invalidateTags: async () => undefined,
  close: async () => undefined
}

export const createCacheProvider = async (
  config?: CacheConfig
): Promise<CacheProvider> => {
  if (!config) return noopCacheProvider
  if (config.provider === 'memory') {
    return createMemoryCacheProvider(config)
  }
  return createRedisCacheProvider(config)
}

export const buildCacheKey = (payload: unknown) => {
  const stablePayload = serializeValue(toStableValue(payload))
  return createHash('sha256').update(stablePayload).digest('hex')
}

export const buildCollectionCacheTag = (database: string, collection: string) =>
  `${database}.${collection}`

export const buildAuthorizationCacheTag = (payload: {
  database: string
  collection: string
  filters?: unknown
}) =>
  `auth:${buildCacheKey({
    database: payload.database,
    collection: payload.collection,
    filters: payload.filters
  })}`

/**
 * Extracts a stable identity fingerprint from a user object for cache-key purposes.
 * Uses `id` (+ `custom_data` when present) to strip volatile JWT noise (e.g., `iat`,
 * `exp`, refresh tokens) while preserving per-principal isolation. Falls back to the
 * full user when no recognizable id is available, which is the safe option.
 */
export const buildUserCacheIdentity = (user: unknown): unknown => {
  if (!user || typeof user !== 'object') return user ?? null
  const candidate = user as {
    id?: unknown
    _id?: unknown
    sub?: unknown
    custom_data?: unknown
  }
  const id =
    typeof candidate.id === 'string' || typeof candidate.id === 'number'
      ? candidate.id
      : typeof candidate._id === 'string' || typeof candidate._id === 'number'
        ? candidate._id
        : typeof candidate.sub === 'string' || typeof candidate.sub === 'number'
          ? candidate.sub
          : undefined
  if (typeof id === 'undefined') return user
  return {
    id,
    ...(typeof candidate.custom_data !== 'undefined'
      ? { custom_data: candidate.custom_data }
      : {})
  }
}

/**
 * Produces a stable fingerprint of the authorization context (roles + filters)
 * so that any change to permission logic (e.g., hot-reloaded rules, role edits)
 * automatically produces a different cache key, preventing stale visibility
 * leaks for aggregate results like `count` that cannot be re-validated on hit.
 */
export const buildRolesSignature = (payload: {
  roles?: unknown
  filters?: unknown
}) =>
  buildCacheKey({
    roles: payload.roles ?? [],
    filters: payload.filters ?? []
  })
