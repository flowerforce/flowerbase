import type { FastifyInstance } from 'fastify'
import { DB_NAME } from '../../constants'
import type { Rules } from '../../features/rules/interface'
import { services as coreServices } from '../../services'
import { StateManager } from '../../state'
import {
  buildCollectionRulesSnapshot,
  COLLECTION_PAGE_SIZE,
  CollectionHistoryItem,
  getErrorDetails,
  getUserInfo,
  isPlainObject,
  resolveUserContext,
  sanitize
} from '../utils'

export type CollectionRoutesDeps = {
  prefix: string
  collectionHistory: CollectionHistoryItem[]
  maxCollectionHistory: number
  addCollectionHistory: (entry: CollectionHistoryItem) => void
}

export const registerCollectionRoutes = (app: FastifyInstance, deps: CollectionRoutesDeps) => {
  const { prefix, collectionHistory, maxCollectionHistory, addCollectionHistory } = deps

  app.get(`${prefix}/api/collections`, async () => {
    const db = app.mongo.client.db(DB_NAME)
    const collections = await db.listCollections().toArray()
    const items = collections
      .filter((entry) => !entry.name.startsWith('system.'))
      .map((entry) => ({
        name: entry.name,
        type: entry.type
      }))
    return { items }
  })

  app.get(`${prefix}/api/collections/:name/rules`, async (req) => {
    const params = req.params as { name: string }
    const query = req.query as { userId?: string; runAsSystem?: string }
    const rules = StateManager.select('rules') as Rules
    const runAsSystem = query?.runAsSystem === 'true'
    const resolvedUser = await resolveUserContext(app, query?.userId)
    return buildCollectionRulesSnapshot(rules, params.name, resolvedUser, runAsSystem)
  })

  app.get(`${prefix}/api/collections/history`, async () => ({
    items: collectionHistory.slice(0, maxCollectionHistory)
  }))

  app.post(`${prefix}/api/collections/query`, async (req, reply) => {
    const body = req.body as {
      collection?: string
      query?: unknown
      sort?: unknown
      page?: number
      recordHistory?: boolean
      runAsSystem?: boolean
      userId?: string
    }
    const collection = body?.collection
    if (!collection) {
      reply.code(400)
      return { error: 'Missing collection name' }
    }
    const rawQuery = body?.query ?? {}
    if (Array.isArray(rawQuery) || typeof rawQuery !== 'object' || rawQuery === null) {
      reply.code(400)
      return { error: 'Query must be an object' }
    }
    const sort = body?.sort
    if (sort !== undefined && !isPlainObject(sort)) {
      reply.code(400)
      return { error: 'Sort must be an object' }
    }
    const page = Math.max(1, Math.floor(Number(body?.page ?? 1) || 1))
    const skip = (page - 1) * COLLECTION_PAGE_SIZE
    const rules = StateManager.select('rules') as Rules
    const services = StateManager.select('services') as typeof coreServices
    const resolvedUser = await resolveUserContext(app, body?.userId)
    const runAsSystem = body?.runAsSystem !== false
    const recordHistory = body?.recordHistory !== false

    try {
      const mongoService = services['mongodb-atlas'](app, {
        rules,
        user: resolvedUser ?? {},
        run_as_system: runAsSystem
      })
      const options: Record<string, unknown> = {}
      if (isPlainObject(sort)) options.sort = sort
      const cursor = mongoService
        .db(DB_NAME)
        .collection(collection)
        .find(rawQuery, undefined, Object.keys(options).length ? options : undefined)
        .skip(skip)
        .limit(COLLECTION_PAGE_SIZE + 1)
      const countPromise = mongoService
        .db(DB_NAME)
        .collection(collection)
        .count(rawQuery)
      const [items, total] = await Promise.all([cursor.toArray(), countPromise])
      const hasMore = page * COLLECTION_PAGE_SIZE < total
      const pageItems = items.length > COLLECTION_PAGE_SIZE
        ? items.slice(0, COLLECTION_PAGE_SIZE)
        : items
      if (recordHistory) {
        addCollectionHistory({
          ts: Date.now(),
          collection,
          mode: 'query',
          query: sanitize(rawQuery),
          sort: sort ? (sanitize(sort) as Record<string, unknown>) : undefined,
          runAsSystem,
          user: getUserInfo(resolvedUser as Record<string, unknown> | undefined),
          page
        })
      }
      return {
        items: sanitize(pageItems),
        count: pageItems.length,
        total,
        page,
        pageSize: COLLECTION_PAGE_SIZE,
        hasMore
      }
    } catch (error) {
      const details = getErrorDetails(error)
      reply.code(500)
      return { error: details.message, stack: details.stack }
    }
  })

  app.post(`${prefix}/api/collections/aggregate`, async (req, reply) => {
    const body = req.body as {
      collection?: string
      pipeline?: unknown
      sort?: unknown
      page?: number
      recordHistory?: boolean
      runAsSystem?: boolean
      userId?: string
    }
    const collection = body?.collection
    if (!collection) {
      reply.code(400)
      return { error: 'Missing collection name' }
    }
    const rawPipeline = body?.pipeline ?? []
    if (!Array.isArray(rawPipeline)) {
      reply.code(400)
      return { error: 'Aggregate pipeline must be an array' }
    }
    const sort = body?.sort
    if (sort !== undefined && !isPlainObject(sort)) {
      reply.code(400)
      return { error: 'Sort must be an object' }
    }
    const page = Math.max(1, Math.floor(Number(body?.page ?? 1) || 1))
    const skip = (page - 1) * COLLECTION_PAGE_SIZE
    const rules = StateManager.select('rules') as Rules
    const services = StateManager.select('services') as typeof coreServices
    const resolvedUser = await resolveUserContext(app, body?.userId)
    const runAsSystem = body?.runAsSystem !== false
    const recordHistory = body?.recordHistory !== false

    try {
      const pipeline = [...rawPipeline]
      if (sort) pipeline.push({ $sort: sort })
      if (skip > 0) pipeline.push({ $skip: skip })
      pipeline.push({ $limit: COLLECTION_PAGE_SIZE + 1 })
      const mongoService = services['mongodb-atlas'](app, {
        rules,
        user: resolvedUser ?? {},
        run_as_system: runAsSystem
      })
      const cursor = mongoService
        .db(DB_NAME)
        .collection(collection)
        .aggregate(pipeline, undefined, true)
      const countCursor = mongoService
        .db(DB_NAME)
        .collection(collection)
        .aggregate([...rawPipeline, { $count: 'total' }], undefined, true)
      const [items, totalResult] = await Promise.all([cursor.toArray(), countCursor.toArray()])
      const total = totalResult?.[0]?.total ?? 0
      const hasMore = page * COLLECTION_PAGE_SIZE < total
      const pageItems = items.length > COLLECTION_PAGE_SIZE
        ? items.slice(0, COLLECTION_PAGE_SIZE)
        : items
      if (recordHistory) {
        addCollectionHistory({
          ts: Date.now(),
          collection,
          mode: 'aggregate',
          pipeline: sanitize(rawPipeline),
          sort: sort ? (sanitize(sort) as Record<string, unknown>) : undefined,
          runAsSystem,
          user: getUserInfo(resolvedUser as Record<string, unknown> | undefined),
          page
        })
      }
      return {
        items: sanitize(pageItems),
        count: pageItems.length,
        total,
        page,
        pageSize: COLLECTION_PAGE_SIZE,
        hasMore
      }
    } catch (error) {
      const details = getErrorDetails(error)
      reply.code(500)
      return { error: details.message, stack: details.stack }
    }
  })
}
