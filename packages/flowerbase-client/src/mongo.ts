import type { App } from './app'
import { EJSON } from './bson'
import { CollectionLike, MongoClientLike } from './types'
import { createWatchIterator } from './watch'

const serialize = (value: unknown) => EJSON.serialize(value, { relaxed: false })
const deserialize = <T>(value: T): T => {
  if (!value || typeof value !== 'object') return value
  return EJSON.deserialize(value as Record<string, unknown>) as T
}

const mapResult = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      return deserialize(JSON.parse(value))
    } catch {
      return value
    }
  }
  return deserialize(value)
}

export const createMongoClient = (app: App, serviceName: string, userId: string): MongoClientLike => ({
  db: (database: string) => ({
    collection: (collection: string): CollectionLike => {
      const callService = async (name: string, args: unknown[]) => {
        const result = await app.callService(name, [
          {
            database,
            collection,
            ...serialize(args[0] ?? {}),
            ...(args[1] !== undefined ? { options: serialize(args[1]) } : {})
          }
        ], serviceName, userId)
        return mapResult(result)
      }

      const normalizeWatchInput = (input?: unknown) => {
        if (Array.isArray(input)) {
          return { pipeline: input, options: {} }
        }
        if (input && typeof input === 'object' && ('ids' in input || 'filter' in input)) {
          const typed = input as { ids?: unknown[]; filter?: Record<string, unknown>; [key: string]: unknown }
          if (typed.ids && typed.filter) {
            throw new Error('watch options cannot include both "ids" and "filter"')
          }
          const { ids, filter, ...options } = typed
          if (ids) {
            return {
              pipeline: [{ $match: { 'documentKey._id': { $in: ids } } }],
              options
            }
          }
          if (filter) {
            return {
              pipeline: [{ $match: filter }],
              options
            }
          }
          return { pipeline: [], options }
        }
        if (input && typeof input === 'object' && ('pipeline' in input || 'options' in input)) {
          const typed = input as { pipeline?: unknown[]; options?: Record<string, unknown> }
          return {
            pipeline: typed.pipeline ?? [],
            options: typed.options ?? {}
          }
        }
        return { pipeline: [], options: (input as Record<string, unknown> | undefined) ?? {} }
      }

      return {
        find: (query = {}, options = {}) => callService('find', [{ query, options }]),
        findOne: (query = {}, options = {}) => callService('findOne', [{ query, options }]),
        findOneAndUpdate: (filter, update, options = {}) =>
          callService('findOneAndUpdate', [{ filter, update, options }]),
        findOneAndReplace: (filter, replacement, options = {}) =>
          callService('findOneAndReplace', [{ filter, replacement, options }]),
        findOneAndDelete: (filter, options = {}) => callService('findOneAndDelete', [{ filter, options }]),
        aggregate: (pipeline) => callService('aggregate', [{ pipeline }]),
        count: (query = {}, options = {}) => callService('count', [{ query, options }]),
        insertOne: (document, options = {}) => callService('insertOne', [{ document, options }]),
        insertMany: (documents, options = {}) => callService('insertMany', [{ documents, options }]),
        updateOne: (filter, update, options = {}) =>
          callService('updateOne', [{ filter, update, options }]),
        updateMany: (filter, update, options = {}) =>
          callService('updateMany', [{ filter, update, options }]),
        deleteOne: (filter, options = {}) => callService('deleteOne', [{ query: filter, options }]),
        deleteMany: (filter, options = {}) => callService('deleteMany', [{ query: filter, options }]),
        watch: (input) => {
          const { pipeline, options } = normalizeWatchInput(input)
          const session = app.getSessionOrThrow(userId)
          return createWatchIterator({
            appId: app.id,
            baseUrl: app.baseUrl,
            accessToken: session.accessToken,
            database,
            collection,
            pipeline,
            options,
            timeout: app.timeout
          })
        }
      }
    }
  })
})
