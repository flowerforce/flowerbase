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

export const createMongoClient = (app: App): MongoClientLike => ({
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
        ])
        return mapResult(result)
      }

      return {
        find: (query = {}, options = {}) => callService('find', [{ query, options }]),
        findOne: (query = {}, options = {}) => callService('findOne', [{ query, options }]),
        insertOne: (document, options = {}) => callService('insertOne', [{ document, options }]),
        updateOne: (filter, update, options = {}) =>
          callService('updateOne', [{ filter, update, options }]),
        updateMany: (filter, update, options = {}) =>
          callService('updateMany', [{ filter, update, options }]),
        deleteOne: (filter, options = {}) => callService('deleteOne', [{ query: filter, options }]),
        watch: (pipeline = [], options = {}) => {
          const session = app.getSessionOrThrow()
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
