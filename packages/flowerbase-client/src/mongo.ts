import type { App } from './app'
import { EJSON } from './bson'
import { CollectionLike, MongoClientLike, MongoDbServiceName } from './types'
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

export const createMongoClient = (app: App, serviceName: MongoDbServiceName, userId: string): MongoClientLike => ({
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
        if (typeof input === 'undefined') {
          return { filter: undefined, ids: undefined }
        }
        if (Array.isArray(input)) {
          throw new Error('watch accepts only an options object with "filter" or "ids"')
        }
        if (!input || typeof input !== 'object') {
          throw new Error('watch options must be an object')
        }

        const typed = input as { ids?: unknown[]; filter?: Record<string, unknown>;[key: string]: unknown }
        const keys = Object.keys(typed)
        const hasOnlyAllowedKeys = keys.every((key) => key === 'ids' || key === 'filter')
        if (!hasOnlyAllowedKeys) {
          throw new Error('watch options support only "filter" or "ids"')
        }
        if (typed.ids || typed.filter) {
          if (typed.ids && typed.filter) {
            throw new Error('watch options cannot include both "ids" and "filter"')
          }
          const { ids, filter } = typed
          if (filter && typeof filter === 'object' && '$match' in filter) {
            throw new Error('watch filter must be a query object, not a $match stage')
          }
          if (ids) {
            if (!Array.isArray(ids)) {
              throw new Error('watch ids must be an array')
            }
            return { filter: undefined, ids }
          }
          if (filter) {
            return { filter, ids: undefined }
          }
          return { filter: undefined, ids: undefined }
        }
        throw new Error('watch options must include "filter" or "ids"')
      }

      return {
        find: (query = {}, options = {}) => callService('find', [{ query, options }]),
        findOne: (query = {}, options = {}) => callService('findOne', [{ query, options }]),
        distinct: (key, filter = {}, options = {}) =>
          callService('distinct', [{ key, query: filter, options }]),
        findOneAndUpdate: (filter, update, options = {}) =>
          callService('findOneAndUpdate', [{ filter, update, options }]),
        findOneAndReplace: (filter, replacement, options = {}) =>
          callService('findOneAndReplace', [{ filter, replacement, options }]),
        findOneAndDelete: (filter, options = {}) => callService('findOneAndDelete', [{ filter, options }]),
        aggregate: (pipeline) => callService('aggregate', [{ pipeline }]),
        count: (query = {}, options = {}) => callService('count', [{ query, options }]),
        insertOne: (document, options = {}) => callService('insertOne', [{ document, options }]),
        insertMany: (documents, options = {}) => callService('insertMany', [{ documents, options }]),
        bulkWrite: (operations, options = {}) =>
          callService('bulkWrite', [{ operations, options }]),
        updateOne: (filter, update, options = {}) =>
          callService('updateOne', [{ filter, update, options }]),
        updateMany: (filter, update, options = {}) =>
          callService('updateMany', [{ filter, update, options }]),
        deleteOne: (filter, options = {}) => callService('deleteOne', [{ query: filter, options }]),
        deleteMany: (filter, options = {}) => callService('deleteMany', [{ query: filter, options }]),
        watch: (options) => {
          const { filter, ids } = normalizeWatchInput(options)
          const session = app.getSessionOrThrow(userId)
          return createWatchIterator({
            appId: app.id,
            baseUrl: app.baseUrl,
            accessToken: session.accessToken,
            database,
            collection,
            filter,
            ids,
            timeout: app.timeout
          })
        }
      }
    }
  })
})
