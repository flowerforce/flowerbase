import cloneDeep from 'lodash/cloneDeep'
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import set from 'lodash/set'
import unset from 'lodash/unset'
import {
  ClientSession,
  ClientSessionOptions,
  Collection,
  Document,
  EventsDescription,
  FindOneAndUpdateOptions,
  FindOneOptions,
  FindOptions,
  Filter as MongoFilter,
  UpdateFilter,
  WithId
} from 'mongodb'
import { Rules } from '../../features/rules/interface'
import { buildRulesMeta } from '../../monitoring/utils'
import { checkValidation } from '../../utils/roles/machines'
import { getWinningRole } from '../../utils/roles/machines/utils'
import { emitServiceEvent } from '../monitoring'
import {
  CRUD_OPERATIONS,
  GetOperatorsFunction,
  MongodbAtlasFunction,
  RealmCompatibleFindOneAndUpdateOptions
} from './model'
import {
  applyAccessControlToPipeline,
  checkDenyOperation,
  ensureClientPipelineStages,
  getFormattedProjection,
  getFormattedQuery,
  getHiddenFieldsFromRulesConfig,
  normalizeQuery
} from './utils'

//TODO aggiungere no-sql inject security
const debugRules = process.env.DEBUG_RULES === 'true'
const debugServices = process.env.DEBUG_SERVICES === 'true'

const logDebug = (message: string, payload?: unknown) => {
  if (!debugRules) return
  const formatted = payload && typeof payload === 'object' ? JSON.stringify(payload) : payload
  console.log(`[rules-debug] ${message}`, formatted ?? '')
}

const getUserId = (user?: unknown) => {
  if (!user || typeof user !== 'object') return undefined
  return (user as { id?: string }).id
}

const logService = (message: string, payload?: unknown) => {
  if (!debugServices) return
  console.log('[service-debug]', message, payload ?? '')
}

const findOptionKeys = new Set([
  'sort',
  'skip',
  'limit',
  'session',
  'hint',
  'maxTimeMS',
  'collation',
  'allowPartialResults',
  'noCursorTimeout',
  'batchSize',
  'returnKey',
  'showRecordId',
  'comment',
  'let',
  'projection'
])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const looksLikeFindOptions = (value: unknown) => {
  if (!isPlainObject(value)) return false
  return Object.keys(value).some((key) => findOptionKeys.has(key))
}

const resolveFindArgs = (
  projectionOrOptions?: Document | FindOptions | FindOneOptions,
  options?: FindOptions | FindOneOptions
) => {
  if (typeof options !== 'undefined') {
    return {
      projection: projectionOrOptions as Document | undefined,
      options
    }
  }

  if (looksLikeFindOptions(projectionOrOptions)) {
    const resolvedOptions = projectionOrOptions as FindOptions | FindOneOptions
    const projection =
      isPlainObject(resolvedOptions) && isPlainObject(resolvedOptions.projection)
        ? (resolvedOptions.projection as Document)
        : undefined
    return {
      projection,
      options: resolvedOptions
    }
  }

  return {
    projection: projectionOrOptions as Document | undefined,
    options: undefined
  }
}

const normalizeInsertManyResult = <T extends { insertedIds?: Record<string, unknown> }>(result: T) => {
  if (!result?.insertedIds || Array.isArray(result.insertedIds)) return result
  return {
    ...result,
    insertedIds: Object.values(result.insertedIds)
  }
}

const normalizeFindOneAndUpdateOptions = (
  options?: RealmCompatibleFindOneAndUpdateOptions
): FindOneAndUpdateOptions | undefined => {
  if (!options) return undefined

  const { returnNewDocument, ...rest } = options
  if (typeof returnNewDocument !== 'boolean' || typeof rest.returnDocument !== 'undefined') {
    return rest
  }

  return {
    ...rest,
    returnDocument: returnNewDocument ? 'after' : 'before'
  }
}

const buildAndQuery = (clauses: MongoFilter<Document>[]): MongoFilter<Document> =>
  clauses.length ? { $and: clauses } : {}

const toWatchMatchFilter = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toWatchMatchFilter(item))
  }

  if (!isPlainObject(value)) return value

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
    if (key.startsWith('$')) {
      acc[key] = toWatchMatchFilter(current)
      return acc
    }
    acc[`fullDocument.${key}`] = toWatchMatchFilter(current)
    return acc
  }, {})
}

const hasAtomicOperators = (data: Document) =>
  Object.keys(data).some((key) => key.startsWith('$'))

const normalizeUpdatePayload = (data: Document) =>
  hasAtomicOperators(data) ? data : { $set: data }

const hasOperatorExpressions = (value: unknown) =>
  isPlainObject(value) && Object.keys(value).some((key) => key.startsWith('$'))

const matchesPullCondition = (item: unknown, operand: unknown) => {
  if (!isPlainObject(operand)) return isEqual(item, operand)
  if (hasOperatorExpressions(operand)) {
    if (Array.isArray((operand as { $in?: unknown }).$in)) {
      return ((operand as { $in: unknown[] }).$in).some((candidate) => isEqual(candidate, item))
    }
    return false
  }
  return Object.entries(operand).every(([key, value]) => isEqual(get(item, key), value))
}

const applyDocumentUpdateOperators = (baseDocument: Document, update: Document): Document => {
  const updated = cloneDeep(baseDocument)

  for (const [operator, payload] of Object.entries(update)) {
    if (!isPlainObject(payload)) continue

    switch (operator) {
      case '$set':
        Object.entries(payload).forEach(([path, value]) => set(updated, path, value))
        break
      case '$unset':
        Object.keys(payload).forEach((path) => {
          unset(updated, path)
        })
        break
      case '$inc':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const increment = typeof value === 'number' ? value : 0
          if (typeof currentValue === 'undefined') {
            set(updated, path, increment)
            return
          }
          if (typeof currentValue !== 'number') {
            throw new Error(`Cannot apply $inc to a non-numeric value at path "${path}"`)
          }
          set(updated, path, currentValue + increment)
        })
        break
      case '$push':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const targetArray = Array.isArray(currentValue) ? [...currentValue] : []
          if (isPlainObject(value) && Array.isArray((value as { $each?: unknown[] }).$each)) {
            targetArray.push(...((value as { $each: unknown[] }).$each))
          } else {
            targetArray.push(value)
          }
          set(updated, path, targetArray)
        })
        break
      case '$addToSet':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const targetArray = Array.isArray(currentValue) ? [...currentValue] : []
          const valuesToAdd =
            isPlainObject(value) && Array.isArray((value as { $each?: unknown[] }).$each)
              ? (value as { $each: unknown[] }).$each
              : [value]
          valuesToAdd.forEach((entry) => {
            if (!targetArray.some((existing) => isEqual(existing, entry))) {
              targetArray.push(entry)
            }
          })
          set(updated, path, targetArray)
        })
        break
      case '$pull':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          if (!Array.isArray(currentValue)) return
          const filtered = currentValue.filter((entry) => !matchesPullCondition(entry, value))
          set(updated, path, filtered)
        })
        break
      case '$pop':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          if (!Array.isArray(currentValue) || !currentValue.length) return
          const next = [...currentValue]
          if (value === -1) {
            next.shift()
          } else {
            next.pop()
          }
          set(updated, path, next)
        })
        break
      case '$mul':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const factor = typeof value === 'number' ? value : 1
          if (typeof currentValue === 'undefined') {
            set(updated, path, 0)
            return
          }
          if (typeof currentValue !== 'number') {
            throw new Error(`Cannot apply $mul to a non-numeric value at path "${path}"`)
          }
          set(updated, path, currentValue * factor)
        })
        break
      case '$min':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const comparableCurrent = currentValue as any
          const comparableValue = value as any
          if (typeof currentValue === 'undefined' || comparableCurrent > comparableValue) {
            set(updated, path, value)
          }
        })
        break
      case '$max':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const comparableCurrent = currentValue as any
          const comparableValue = value as any
          if (typeof currentValue === 'undefined' || comparableCurrent < comparableValue) {
            set(updated, path, value)
          }
        })
        break
      case '$rename':
        Object.entries(payload).forEach(([fromPath, toPath]) => {
          if (typeof toPath !== 'string') return
          const currentValue = get(updated, fromPath)
          if (typeof currentValue === 'undefined') return
          set(updated, toPath, currentValue)
          unset(updated, fromPath)
        })
        break
      case '$currentDate':
        Object.keys(payload).forEach((path) => set(updated, path, new Date()))
        break
      case '$setOnInsert':
        break
      default:
        break
    }
  }

  return updated
}

const getUpdatedPaths = (update: Document) => {
  const entries = Object.entries(update ?? {})
  const hasOperators = entries.some(([key]) => key.startsWith('$'))

  if (!hasOperators) {
    return Object.keys(update ?? {})
  }

  const paths = new Set<string>()
  for (const [key, value] of entries) {
    if (!key.startsWith('$')) continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.keys(value as Document).forEach((path) => paths.add(path))
    }
  }
  return [...paths]
}

const areUpdatedFieldsAllowed = (
  filtered: Document | null | undefined,
  updated: Document,
  updatedPaths: string[]
) => {
  if (!filtered) return false
  if (!updatedPaths.length) return isEqual(filtered, updated)
  return updatedPaths.every((path) => isEqual(get(filtered, path), get(updated, path)))
}

const getOperators: GetOperatorsFunction = (
  collection,
  { rules, collName, user, run_as_system, monitoringOrigin }
) => {
  const normalizedRules: Rules = rules ?? ({} as Rules)
  const collectionRules = normalizedRules[collName]
  const filters = collectionRules?.filters ?? []
  const roles = collectionRules?.roles ?? []
  const fallbackAccess = (doc: Document | null | undefined = undefined) => ({
    status: false,
    document: doc
  })
  const rulesMeta = buildRulesMeta({
    serviceName: 'mongodb-atlas',
    rules: normalizedRules,
    user,
    runAsSystem: run_as_system,
    collection: collName
  })
  const emitMongoEvent = (
    operation: string,
    meta?: Record<string, unknown>,
    error?: unknown
  ) => {
    const userId = getUserId(user)
    emitServiceEvent({
      type: 'mongo',
      source: 'service:mongodb-atlas',
      message: error ? `mongo ${operation} failed` : `mongo ${operation}`,
      data: {
        operation,
        collection: collName,
        runAsSystem: !!run_as_system,
        ...(userId ? { userId } : {}),
        rules: rulesMeta,
        ...(meta ?? {})
      },
      error,
      origin: monitoringOrigin
    })
  }

  return {
    /**
     * Finds a single document in a MongoDB collection with optional role-based filtering and validation.
     *
     * @param {Filter<Document>} query - The MongoDB query used to match the document.
     * @param {Document} [projection] - Optional projection to select returned fields.
     * @param {FindOneOptions} [options] - Optional settings for the findOne operation.
     * @returns {Promise<Document | {} | null>} A promise resolving to the document if found and permitted, an empty object if access is denied, or `null` if not found.
     *
     * @description
     * If `run_as_system` is enabled, the function behaves like a standard `collection.findOne(query)` with no access checks.
     * Otherwise:
     *  - Merges the provided query with any access control filters using `getFormattedQuery`.
     *  - Attempts to find the document using the formatted query.
     *  - Determines the user's role via `getWinningRole`.
     *  - Validates the result using `checkValidation` to ensure read permission.
     *  - If validation fails, returns an empty object; otherwise returns the validated document.
     */
    findOne: async (query = {}, projectionOrOptions, options) => {
      try {
        const { projection, options: normalizedOptions } = resolveFindArgs(
          projectionOrOptions,
          options
        )
        const resolvedOptions =
          projection || normalizedOptions
            ? {
                ...(normalizedOptions ?? {}),
                ...(projection ? { projection } : {})
              }
            : undefined
        const resolvedQuery = query ?? {}
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.READ)
          // Apply access control filters to the query
          const formattedQuery = getFormattedQuery(filters, resolvedQuery, user)
          logDebug('update formattedQuery', {
            collection: collName,
            query,
            formattedQuery
          })
          logDebug('find formattedQuery', {
            collection: collName,
            query,
            formattedQuery,
            rolesLength: roles.length
          })

          logService('findOne query', { collName, formattedQuery })
          const safeQuery = normalizeQuery(formattedQuery)
          logService('findOne normalizedQuery', { collName, safeQuery })
          const result = await collection.findOne(buildAndQuery(safeQuery), resolvedOptions)
          logDebug('findOne result', {
            collection: collName,
            result
          })
          logService('findOne result', { collName, result })

          const winningRole = getWinningRole(result, user, roles)

          logDebug('findOne winningRole', {
            collection: collName,
            winningRoleName: winningRole?.name ?? null,
            userId: getUserId(user)
          })
          const { status, document } = winningRole
            ? await checkValidation(
                winningRole,
                {
                  type: 'read',
                  roles,
                  cursor: result,
                  expansions: {}
                },
                user
              )
            : fallbackAccess(result)

          // Return validated document or empty object if not permitted
          const response = status ? document : {}
          emitMongoEvent('findOne')
          return Promise.resolve(response)
        }
        // System mode: no validation applied
        const response = await collection.findOne(resolvedQuery, resolvedOptions)
        emitMongoEvent('findOne')
        return response
      } catch (error) {
        emitMongoEvent('findOne', undefined, error)
        throw error
      }
    },
    /**
     * Deletes a single document from a MongoDB collection with optional role-based validation.
     *
     * @param {Filter<Document>} [query={}] - The MongoDB query used to match the document to delete.
     * @param {DeleteOptions} [options] - Optional settings for the delete operation.
     * @returns {Promise<DeleteResult>} A promise resolving to the result of the delete operation.
     *
     * @throws {Error} If the user is not authorized to delete the document.
     *
     * @description
     * If `run_as_system` is enabled, the function deletes the document directly using `collection.deleteOne(query)`.
     * Otherwise:
     *  - Applies role-based and custom filters to the query using `getFormattedQuery`.
     *  - Retrieves the document using `findOne` to validate user permissions.
     *  - Checks if the user has the appropriate role to perform a delete via `checkValidation`.
     *  - If validation fails, throws an error.
     *  - If validation passes, deletes the document using the filtered query.
     */
    deleteOne: async (query = {}, options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.DELETE)
          // Apply access control filters
          const formattedQuery = getFormattedQuery(filters, query, user)

          // Retrieve the document to check permissions before deleting
          const result = await collection.findOne(buildAndQuery(formattedQuery))
          const winningRole = getWinningRole(result, user, roles)

          logDebug('delete winningRole', {
            collection: collName,
            userId: getUserId(user),
            winningRoleName: winningRole?.name ?? null
          })
          const { status } = winningRole
            ? await checkValidation(
                winningRole,
                {
                  type: 'delete',
                  roles,
                  cursor: result,
                  expansions: {}
                },
                user
              )
            : fallbackAccess(result)

          if (!status) {
            throw new Error('Delete not permitted')
          }

          const res = await collection.deleteOne(buildAndQuery(formattedQuery), options)
          emitMongoEvent('deleteOne')
          return res
        }
        // System mode: bypass access control
        const result = await collection.deleteOne(query, options)
        emitMongoEvent('deleteOne')
        return result
      } catch (error) {
        emitMongoEvent('deleteOne', undefined, error)
        throw error
      }
    },
    /**
     * Inserts a single document into a MongoDB collection with optional role-based validation.
     *
     * @param {OptionalId<Document>} data - The document to insert.
     * @param {InsertOneOptions} [options] - Optional settings for the insert operation, such as `writeConcern`.
     * @returns {Promise<InsertOneResult<Document>>} A promise resolving to the result of the insert operation.
     *
     * @throws {Error} If the user is not authorized to insert the document.
     *
     * @description
     * If `run_as_system` is enabled, the document is inserted directly without any validation.
     * Otherwise:
     *  - Determines the appropriate user role using `getWinningRole`.
     *  - Validates the insert operation using `checkValidation`.
     *  - If validation fails, an error is thrown.
     *  - If validation passes, the document is inserted.
     *
     * This ensures that only users with the correct permissions can insert data into the collection.
     */
    insertOne: async (data, options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.CREATE)
          const winningRole = getWinningRole(data, user, roles)

          const { status, document } = winningRole
            ? await checkValidation(
                winningRole,
                {
                  type: 'insert',
                  roles,
                  cursor: data,
                  expansions: {}
                },
                user
              )
            : fallbackAccess(data)

          if (!status || !isEqual(data, document)) {
            throw new Error('Insert not permitted')
          }
          logService('insertOne payload', { collName, data })
          const insertResult = await collection.insertOne(data, options)
          logService('insertOne result', {
            collName,
            insertedId: insertResult.insertedId.toString(),
            document: data
          })
          emitMongoEvent('insertOne')
          return insertResult
        }
        // System mode: insert without validation
        const insertResult = await collection.insertOne(data, options)
        emitMongoEvent('insertOne')
        return insertResult
      } catch (error) {
        emitMongoEvent('insertOne', undefined, error)
        throw error
      }
    },
    /**
     * Updates a single document in a MongoDB collection with optional role-based validation.
     *
     * @param {Filter<Document>} query - The MongoDB query used to match the document to update.
     * @param {UpdateFilter<Document> | Partial<Document>} data - The update operations or replacement document.
     * @param {UpdateOptions} [options] - Optional settings for the update operation.
     * @returns {Promise<UpdateResult>} A promise resolving to the result of the update operation.
     *
     * @throws {Error} If the user is not authorized to update the document.
     *
     * @description
     * If `run_as_system` is enabled, the function directly updates the document using `collection.updateOne(query, data, options)`.
     * Otherwise, it follows these steps:
     *  - Applies access control filters to the query using `getFormattedQuery`.
     *  - Retrieves the document using `findOne` to check if it exists and whether the user has permission to modify it.
     *  - Determines the user's role via `getWinningRole`.
     *  - Flattens update operators (`$set`, `$inc`, etc.) if present to extract the final modified fields.
     *  - Validates the update data using `checkValidation` to ensure compliance with role-based rules.
     *  - Ensures that no unauthorized modifications occur by comparing the validated document with the intended changes.
     *  - If validation fails, throws an error; otherwise, updates the document.
     */
    updateOne: async (query, data, options) => {
      try {
        const normalizedData = normalizeUpdatePayload(data as Document)
        if (!run_as_system) {

          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.UPDATE)
          // Apply access control filters

          // Normalize _id
          const formattedQuery = getFormattedQuery(filters, query, user)
          const safeQuery = Array.isArray(formattedQuery)
            ? normalizeQuery(formattedQuery)
            : formattedQuery

          const result = await collection.findOne(buildAndQuery(safeQuery))

          if (!result) {
            if (options?.upsert) {
              const upsertResult = await collection.updateOne(
                buildAndQuery(safeQuery),
                normalizedData,
                options
              )
              emitMongoEvent('updateOne')
              return upsertResult
            }
            throw new Error('Update not permitted')
          }

          const winningRole = getWinningRole(result, user, roles)

          // Check if the update data contains MongoDB update operators (e.g., $set, $inc)
          const updatedPaths = getUpdatedPaths(normalizedData)
          const docToCheck = applyDocumentUpdateOperators(result, normalizedData)
          // Validate update permissions
          const { status, document } = winningRole
            ? await checkValidation(
                winningRole,
                {
                  type: 'write',
                  roles,
                  cursor: docToCheck,
                  expansions: {}
                },
                user
              )
            : fallbackAccess(docToCheck)
          // Ensure no unauthorized changes are made
          const areDocumentsEqual = areUpdatedFieldsAllowed(document, docToCheck, updatedPaths)

          if (!status || !areDocumentsEqual) {
            throw new Error('Update not permitted')
          }
          const res = await collection.updateOne(buildAndQuery(safeQuery), normalizedData, options)
          emitMongoEvent('updateOne')
          return res
        }
        const result = await collection.updateOne(query, normalizedData, options)
        emitMongoEvent('updateOne')
        return result
      } catch (error) {
        emitMongoEvent('updateOne', undefined, error)
        throw error
      }
    },
    /**
     * Finds and updates a single document with role-based validation and access control.
     *
     * @param {Filter<Document>} query - The MongoDB query used to match the document to update.
     * @param {UpdateFilter<Document> | Partial<Document>} data - The update operations or replacement document.
     * @param {FindOneAndUpdateOptions} [options] - Optional settings for the findOneAndUpdate operation.
     * @returns {Promise<FindAndModifyResult<Document>>} The result of the findOneAndUpdate operation.
     *
     * @throws {Error} If the user is not authorized to update the document.
     */
    findOneAndUpdate: async (
      query: MongoFilter<Document>,
      data: UpdateFilter<Document> | Document[],
      options?: RealmCompatibleFindOneAndUpdateOptions
    ) => {
      try {
        const normalizedOptions = normalizeFindOneAndUpdateOptions(options)
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.UPDATE)
          const formattedQuery = getFormattedQuery(filters, query, user)
          const safeQuery = Array.isArray(formattedQuery)
            ? normalizeQuery(formattedQuery)
            : formattedQuery
          const normalizedData = Array.isArray(data)
            ? data
            : normalizeUpdatePayload(data as Document)
          const currentDoc = await collection.findOne(buildAndQuery(safeQuery))
          const updatedPaths = Array.isArray(normalizedData)
            ? []
            : getUpdatedPaths(normalizedData as Document)
          let docToCheck: Document
          let validationType: 'write' | 'insert' = 'write'

          if (!currentDoc) {
            if (!normalizedOptions?.upsert || Array.isArray(normalizedData)) {
              throw new Error('Update not permitted')
            }

            const updateDocument = normalizedData as Document
            const setOnInsertSeed =
              isPlainObject(updateDocument.$setOnInsert)
                ? (updateDocument.$setOnInsert as Document)
                : {}
            docToCheck = applyDocumentUpdateOperators(setOnInsertSeed, updateDocument)
            validationType = 'insert'
          } else {
            const [computedDoc] = Array.isArray(normalizedData)
              ? await collection.aggregate([
                { $match: buildAndQuery(safeQuery) },
                { $limit: 1 },
                ...normalizedData
              ]).toArray()
              : [applyDocumentUpdateOperators(currentDoc, normalizedData as Document)]
            docToCheck = computedDoc
          }

          const winningRole = getWinningRole(docToCheck, user, roles)

          const { status, document } = winningRole
            ? await checkValidation(
              winningRole,
              {
                type: validationType,
                roles,
                cursor: docToCheck,
                expansions: {}
              },
              user
            )
            : fallbackAccess(docToCheck)

          const areDocumentsEqual = areUpdatedFieldsAllowed(document, docToCheck, updatedPaths)
          if (!status || !areDocumentsEqual) {
            throw new Error('Update not permitted')
          }

          const updateResult = normalizedOptions
            ? await collection.findOneAndUpdate(buildAndQuery(safeQuery), normalizedData, normalizedOptions)
            : await collection.findOneAndUpdate(buildAndQuery(safeQuery), normalizedData)
          if (!updateResult) {
            emitMongoEvent('findOneAndUpdate')
            return updateResult
          }

          const readRole = getWinningRole(updateResult, user, roles)
          const readResult = readRole
            ? await checkValidation(
                readRole,
                {
                  type: 'read',
                  roles,
                  cursor: updateResult,
                  expansions: {}
                },
                user
              )
            : fallbackAccess(updateResult)

          const sanitizedDoc = readResult.status ? (readResult.document ?? updateResult) : {}
          emitMongoEvent('findOneAndUpdate')
          return sanitizedDoc
        }

        const updateResult = normalizedOptions
          ? await collection.findOneAndUpdate(query, data, normalizedOptions)
          : await collection.findOneAndUpdate(query, data)
        emitMongoEvent('findOneAndUpdate')
        return updateResult
      } catch (error) {
        emitMongoEvent('findOneAndUpdate', undefined, error)
        throw error
      }
    },
    /**
     * Finds documents in a MongoDB collection with optional role-based access control and post-query validation.
     *
     * @param {Filter<Document>} query - The MongoDB query to filter documents.
     * @param {Document} [projection] - Optional projection to select returned fields.
     * @param {FindOptions} [options] - Optional settings for the find operation.
     * @param {FindOptions} [options] - Optional settings for the find operation.
     * @returns {FindCursor} A customized `FindCursor` that includes additional access control logic in its `toArray()` method.
     *
     * @description
     * If `run_as_system` is enabled, the function simply returns a regular MongoDB cursor (`collection.find(query)`).
     * Otherwise:
     *  - Combines the user query with role-based filters via `getFormattedQuery`.
     *  - Executes the query using `collection.find` with a `$and` of all filters.
     *  - Returns a cloned `FindCursor` where `toArray()`:
     *    - Applies additional post-query validation using `checkValidation` for each document.
     *    - Filters out documents the current user is not authorized to read.
     *
     * This ensures that both pre-query filtering and post-query validation are applied consistently.
     */
    find: (query = {}, projectionOrOptions, options) => {
      try {
        const { projection, options: normalizedOptions } = resolveFindArgs(
          projectionOrOptions,
          options
        )
        const resolvedOptions =
          projection || normalizedOptions
            ? {
                ...(normalizedOptions ?? {}),
                ...(projection ? { projection } : {})
              }
            : undefined
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.READ)
          // Pre-query filtering based on access control rules
          const formattedQuery = getFormattedQuery(filters, query, user)
          const currentQuery = formattedQuery.length ? { $and: formattedQuery } : {}
          // aggiunto filter per evitare questo errore: $and argument's entries must be objects
          const cursor = collection.find(currentQuery, resolvedOptions)
          const originalToArray = cursor.toArray.bind(cursor)

          /**
           * Overridden `toArray` method that validates each document for read access.
           *
           * @returns {Promise<Document[]>} An array of documents the user is authorized to read.
           */
          cursor.toArray = async () => {
            const response = await originalToArray()

            const filteredResponse = await Promise.all(
              response.map(async (currentDoc) => {
                const winningRole = getWinningRole(currentDoc, user, roles)

                logDebug('find winningRole', {
                  collection: collName,
                  userId: getUserId(user),
                  winningRoleName: winningRole?.name ?? null,
                  rolesLength: roles.length
                })
                const { status, document } = winningRole
                  ? await checkValidation(
                      winningRole,
                      {
                        type: 'read',
                        roles,
                        cursor: currentDoc,
                        expansions: {}
                      },
                      user
                    )
                  : fallbackAccess(currentDoc)

                return status ? document : undefined
              })
            )

            return filteredResponse.filter(Boolean) as WithId<Document>[]
          }

          emitMongoEvent('find')
          return cursor
        }
        // System mode: return original unfiltered cursor
        const cursor = collection.find(query, resolvedOptions)
        emitMongoEvent('find')
        return cursor
      } catch (error) {
        emitMongoEvent('find', undefined, error)
        throw error
      }
    },
    count: async (query, options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.READ)
          const formattedQuery = getFormattedQuery(filters, query, user)
          const currentQuery = formattedQuery.length ? { $and: formattedQuery } : {}
          logService('count query', { collName, currentQuery })
          const result = await collection.countDocuments(currentQuery, options)
          emitMongoEvent('count')
          return result
        }

        const result = await collection.countDocuments(query, options)
        emitMongoEvent('count')
        return result
      } catch (error) {
        emitMongoEvent('count', undefined, error)
        throw error
      }
    },
    countDocuments: async (query, options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.READ)
          const formattedQuery = getFormattedQuery(filters, query, user)
          const currentQuery = formattedQuery.length ? { $and: formattedQuery } : {}
          logService('countDocuments query', { collName, currentQuery })
          const result = await collection.countDocuments(currentQuery, options)
          emitMongoEvent('countDocuments')
          return result
        }

        const result = await collection.countDocuments(query, options)
        emitMongoEvent('countDocuments')
        return result
      } catch (error) {
        emitMongoEvent('countDocuments', undefined, error)
        throw error
      }
    },
    /**
     * Watches changes on a MongoDB collection with optional role-based filtering of change events.
     *
     * @param {Document[]} [pipeline=[]] - Optional aggregation pipeline stages to apply to the change stream.
     * @param {ChangeStreamOptions} [options] - Optional settings for the change stream, such as `fullDocument`, `resumeAfter`, etc.
     * @returns {ChangeStream} A MongoDB `ChangeStream` instance, optionally enhanced with access control.
     *
     * @description
     * If `run_as_system` is enabled, this function simply returns `collection.watch(pipeline, options)`.
     * Otherwise:
     *  - Applies access control filters via `getFormattedQuery`.
     *  - Prepends a `$match` stage to the pipeline to limit watched changes to authorized documents.
     *  - Overrides the `.on()` method of the returned `ChangeStream` to:
     *    - Validate the `fullDocument` and any `updatedFields` using `checkValidation`.
     *    - Filter out change events the user is not authorized to see.
     *    - Pass only validated and filtered events to the original listener.
     *
     * This allows fine-grained control over what change events a user can observe, based on roles and filters.
     */
    watch: (pipeline = [], options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.READ
          )
          // Apply access filters to initial change stream pipeline
          const formattedQuery = getFormattedQuery(filters, {}, user)
          const watchFormattedQuery = formattedQuery.map(
            (condition) => toWatchMatchFilter(condition) as MongoFilter<Document>
          )

          const firstStep = watchFormattedQuery.length
            ? {
                $match: {
                  $and: watchFormattedQuery
                }
              }
            : undefined

          const formattedPipeline = [firstStep, ...pipeline].filter(Boolean) as Document[]

          const result = collection.watch(formattedPipeline, options)
          const originalOn = result.on.bind(result)

          /**
           * Validates a change event against the user's roles.
           *
           * @param {Document} change - A change event from the ChangeStream.
           * @returns {Promise<{ status: boolean, document: Document, updatedFieldsStatus: boolean, updatedFields: Document, hasFullDocument: boolean, hasWinningRole: boolean }>}
           */
          const isValidChange = async (change: Document) => {
            const { fullDocument, updateDescription } = change
            const hasFullDocument = !!fullDocument
            const winningRole = getWinningRole(fullDocument, user, roles)

            const fullDocumentValidation = winningRole
              ? await checkValidation(
                  winningRole,
                  {
                    type: 'read',
                    roles,
                    cursor: fullDocument,
                    expansions: {}
                  },
                  user
                )
              : fallbackAccess(fullDocument)
            const { status, document } = fullDocumentValidation

            const { status: updatedFieldsStatus, document: updatedFields } = winningRole
              ? await checkValidation(
                  winningRole,
                  {
                    type: 'read',
                    roles,
                    cursor: updateDescription?.updatedFields,
                    expansions: {}
                  },
                  user
                )
              : fallbackAccess(updateDescription?.updatedFields)

            return {
              status,
              document,
              updatedFieldsStatus,
              updatedFields,
              hasFullDocument,
              hasWinningRole: !!winningRole
            }
          }

          // Override the .on() method to apply validation before emitting events
          result.on = <EventKey extends keyof EventsDescription>(
            eventType: EventKey,
            listener: EventsDescription[EventKey]
          ) => {
            return originalOn(eventType, async (change: Document) => {
              const {
                document,
                updatedFieldsStatus,
                updatedFields,
                hasFullDocument,
                hasWinningRole
              } = await isValidChange(change)

              const filteredChange = {
                ...change,
                fullDocument: document,
                updateDescription: {
                  ...change.updateDescription,
                  updatedFields: updatedFieldsStatus ? updatedFields : {}
                }
              }

              console.log('[flowerbase watch] delivered change', {
                collection: collName,
                operationType: change?.operationType,
                eventType,
                hasFullDocument,
                hasWinningRole,
                updatedFieldsStatus,
                documentKey:
                  change?.documentKey?._id?.toString?.() ||
                  change?.documentKey?._id ||
                  null
              })
              listener(filteredChange)
            })
          }
          emitMongoEvent('watch')
          return result
        }

        // System mode: no filtering applied
        const result = collection.watch(pipeline, options)
        emitMongoEvent('watch')
        return result
      } catch (error) {
        emitMongoEvent('watch', undefined, error)
        throw error
      }
    },
    //TODO -> add filter & rules in aggregate
    aggregate: (pipeline = [], options, isClient) => {
      try {
        if (run_as_system || !isClient) {
          const cursor = collection.aggregate(pipeline, options)
          emitMongoEvent('aggregate')
          return cursor
        }

        checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.READ)

        const rulesConfig = collectionRules ?? { filters, roles }

        ensureClientPipelineStages(pipeline)

        const formattedQuery = getFormattedQuery(filters, {}, user)
        logDebug('aggregate formattedQuery', {
          collection: collName,
          formattedQuery,
          pipeline
        })
        const projection = getFormattedProjection(filters)
        const hiddenFields = getHiddenFieldsFromRulesConfig(rulesConfig)

        const sanitizedPipeline = applyAccessControlToPipeline(
          pipeline,
          normalizedRules,
          user,
          collName,
          { isClientPipeline: true }
        )
        logDebug('aggregate sanitizedPipeline', {
          collection: collName,
          sanitizedPipeline
        })

        const guardedPipeline = [
          ...(hiddenFields.length ? [{ $unset: hiddenFields }] : []),
          ...(formattedQuery.length ? [{ $match: { $and: formattedQuery } }] : []),
          ...(projection ? [{ $project: projection }] : []),
          ...sanitizedPipeline
        ]

        const originalCursor = collection.aggregate(guardedPipeline, options)
        const newCursor = Object.create(originalCursor)

        newCursor.toArray = async () => originalCursor.toArray()

        emitMongoEvent('aggregate')
        return newCursor
      } catch (error) {
        emitMongoEvent('aggregate', undefined, error)
        throw error
      }
    },
    /**
     * Inserts multiple documents into a MongoDB collection with optional role-based access control and validation.
     *
     * @param {OptionalId<Document>[]} documents - The array of documents to insert.
     * @param {BulkWriteOptions} [options] - Optional settings passed to `insertMany`, such as `ordered`, `writeConcern`, etc.
     * @returns {Promise<InsertManyResult<Document>>} A promise resolving to the result of the insert operation.
     *
     * @throws {Error} If no documents pass validation or user is not permitted to insert.
     *
     * @description
     * If `run_as_system` is enabled, this function directly inserts the documents without validation.
     * Otherwise, for each document:
     *  - Finds the user's applicable role using `getWinningRole`.
     *  - Validates the insert operation through `checkValidation`.
     *  - Filters out any documents the user is not authorized to insert.
     * Only documents passing validation will be inserted.
     */
    insertMany: async (documents, options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.CREATE)
          // Validate each document against user's roles
          const filteredItems = await Promise.all(
            documents.map(async (currentDoc) => {
              const winningRole = getWinningRole(currentDoc, user, roles)

              const { status, document } = winningRole
                ? await checkValidation(
                    winningRole,
                    {
                      type: 'insert',
                      roles,
                      cursor: currentDoc,
                      expansions: {}
                    },
                    user
                  )
                : fallbackAccess(currentDoc)

              return status ? document : undefined
            })
          )

          const canInsert = isEqual(filteredItems, documents)

          if (!canInsert) {
            throw new Error('Insert not permitted')
          }

          const result = await collection.insertMany(documents, options)
          emitMongoEvent('insertMany')
          return normalizeInsertManyResult(result)
        }
        // If system mode is active, insert all documents without validation
        const result = await collection.insertMany(documents, options)
        emitMongoEvent('insertMany')
        return normalizeInsertManyResult(result)
      } catch (error) {
        emitMongoEvent('insertMany', undefined, error)
        throw error
      }
    },
    updateMany: async (query, data, options) => {
      try {
        const normalizedData = normalizeUpdatePayload(data as Document)
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.UPDATE)
          // Apply access control filters
          const formattedQuery = getFormattedQuery(filters, query, user)

          // Retrieve the document to check permissions before updating
          const result = await collection.find({ $and: formattedQuery }).toArray()
          if (!result) {
            console.log('check1 In updateMany --> (!result)')
            throw new Error('Update not permitted')
          }

          // Check if the update data contains MongoDB update operators (e.g., $set, $inc)
          const updatedPaths = getUpdatedPaths(normalizedData)
          const docsToCheck = result.map((currentDoc) =>
            applyDocumentUpdateOperators(currentDoc, normalizedData)
          )

          const filteredItems = await Promise.all(
            docsToCheck.map(async (currentDoc) => {
              const winningRole = getWinningRole(currentDoc, user, roles)

              const { status, document } = winningRole
                ? await checkValidation(
                    winningRole,
                    {
                      type: 'write',
                      roles,
                      cursor: currentDoc,
                      expansions: {}
                    },
                    user
                  )
                : fallbackAccess(currentDoc)

              return status ? document : undefined
            })
          )

          // Ensure no unauthorized changes are made
          const areDocumentsEqual = docsToCheck.every((doc, index) =>
            areUpdatedFieldsAllowed(filteredItems[index], doc, updatedPaths)
          )

          if (!areDocumentsEqual) {
            console.log('check1 In updateMany --> (!areDocumentsEqual)')

            throw new Error('Update not permitted')
          }

          const res = await collection.updateMany({ $and: formattedQuery }, normalizedData, options)
          emitMongoEvent('updateMany')
          return res
        }
        const result = await collection.updateMany(query, normalizedData, options)
        emitMongoEvent('updateMany')
        return result
      } catch (error) {
        emitMongoEvent('updateMany', undefined, error)
        throw error
      }
    },
    /**
     * Deletes multiple documents from a MongoDB collection with role-based access control and validation.
     *
     * @param query - The initial MongoDB query to filter documents to be deleted.
     * @param {DeleteOptions} [options] - Optional settings for the delete operation.
     * @returns {Promise<{ acknowledged: boolean, deletedCount: number }>} A promise resolving to the deletion result.
     *
     * @description
     * If `run_as_system` is enabled, this function directly deletes documents matching the given query.
     * Otherwise, it:
     *  - Applies additional filters from access control rules.
     *  - Fetches matching documents.
     *  - Validates each document against user roles.
     *  - Deletes only the documents that the current user has permission to delete.
     */
    deleteMany: async (query = {}, options) => {
      try {
        if (!run_as_system) {
          checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.DELETE)
          // Apply access control filters
          const formattedQuery = getFormattedQuery(filters, query, user)

          // Fetch documents matching the combined filters
          const data = await collection.find({ $and: formattedQuery }).toArray()

          // Filter and validate each document based on user's roles
          const filteredItems = await Promise.all(
            data.map(async (currentDoc) => {
              const winningRole = getWinningRole(currentDoc, user, roles)

              const { status, document } = winningRole
                ? await checkValidation(
                    winningRole,
                    {
                      type: 'delete',
                      roles,
                      cursor: currentDoc,
                      expansions: {}
                    },
                    user
                  )
                : fallbackAccess(currentDoc)

              return status ? document : undefined
            })
          )

          // Extract IDs of documents that passed validation
          const elementsToDelete = (filteredItems.filter(Boolean) as WithId<Document>[]).map(
            ({ _id }) => _id
          )

          if (!elementsToDelete.length) {
            const result = {
              acknowledged: true,
              deletedCount: 0
            }
            emitMongoEvent('deleteMany')
            return Promise.resolve(result)
          }
          // Build final delete query with access control and ID filter
          const deleteQuery = {
            $and: [...formattedQuery, { _id: { $in: elementsToDelete } }]
          }
          const result = await collection.deleteMany(deleteQuery, options)
          emitMongoEvent('deleteMany')
          return result
        }
        // If running as system, bypass access control and delete directly
        const result = await collection.deleteMany(query, options)
        emitMongoEvent('deleteMany')
        return result
      } catch (error) {
        emitMongoEvent('deleteMany', undefined, error)
        throw error
      }
    }
  }
}

const MongodbAtlas: MongodbAtlasFunction = (
  app,
  { rules, user, run_as_system, monitoring } = {}
) => ({
  startSession: (options?: ClientSessionOptions) => {
    const mongoClient = app.mongo.client as unknown as {
      startSession: (sessionOptions?: ClientSessionOptions) => ClientSession
    }
    return mongoClient.startSession(options)
  },
  db: (dbName: string) => {
    return {
      collection: (collName: string) => {
        const mongoClient = app.mongo.client as unknown as {
          db: (database: string) => {
            collection: (name: string) => Collection<Document>
          }
        }
        const collection: Collection<Document> = mongoClient.db(dbName).collection(collName)
        return getOperators(collection, {
          rules,
          collName,
          user,
          run_as_system,
          monitoringOrigin: monitoring?.invokedFrom
        })
      }
    }
  }
})

export default MongodbAtlas
