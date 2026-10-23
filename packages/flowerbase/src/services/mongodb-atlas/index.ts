import cloneDeep from 'lodash/cloneDeep'
import get from 'lodash/get'
import isEqual from 'lodash/isEqual'
import set from 'lodash/set'
import unset from 'lodash/unset'
import {
  BSON,
  ChangeStreamOptions,
  ClientSession,
  ClientSessionOptions,
  Document,
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
import { evaluateExpression } from '../../utils/roles/helpers'
import { FieldPermissionExpression, Role } from '../../utils/roles/interface'
import { getWinningRoleAsync } from '../../utils/roles/machines/utils'
import { emitServiceEvent } from '../monitoring'
import { CHANGESTREAM } from '../../constants'
import {
  CRUD_OPERATIONS,
  GetOperatorsFunction,
  MongodbAtlasFunction,
  RealmCompatibleFindOneAndUpdateOptions
} from './model'
import {
  checkDenyOperation,
  getCollectionRules,
  getFormattedProjection,
  getFormattedQuery,
  mergeProjections,
  normalizeQuery
} from './utils'
import { buildAuthorizedReadPipeline, rewriteAuthorizedReadStages } from './readPipeline'
import { authorizeAggregate } from './authorizedAggregate'
import { authorizeWatch } from './authorizedWatch'
import { createAuthorizedFindCursor, projectReadableDocument } from './authorizedFindCursor'

//TODO aggiungere no-sql inject security
const debugRules = process.env.DEBUG_RULES === 'true'
const debugServices = process.env.DEBUG_SERVICES === 'true'

const logDebug = (message: string, payload?: unknown) => {
  if (!debugRules) return
  const formatted =
    payload && typeof payload === 'object' ? JSON.stringify(payload) : payload
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

const isTraversablePlainObject = (value: unknown): value is Record<string, unknown> => {
  if (!isPlainObject(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const looksLikeFindOptions = (value: unknown) => {
  if (!isPlainObject(value)) return false
  return Object.keys(value).some((key) => findOptionKeys.has(key))
}

const authorizedReadOptions = (options?: Document) => {
  if (options?.returnKey || options?.raw || options?.fieldsAsRaw) {
    throw new Error('Read options must preserve the full document for authorization')
  }
  const { projection: ignoredProjection, ...rest } = options ?? {}
  return { ...rest, collation: { locale: 'simple' } }
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

const normalizeInsertManyResult = <T extends { insertedIds?: Record<string, unknown> }>(
  result: T
) => {
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
  if (
    typeof returnNewDocument !== 'boolean' ||
    typeof rest.returnDocument !== 'undefined'
  ) {
    return rest
  }

  return {
    ...rest,
    returnDocument: returnNewDocument ? 'after' : 'before'
  }
}

const getValidationExpansions = (prevRoot?: Document | null) => ({
  '%%prevRoot': prevRoot
})

const buildAndQuery = (clauses: MongoFilter<Document>[]): MongoFilter<Document> =>
  clauses.length ? { $and: clauses } : {}

const watchChangeEventRootKeys = new Set([
  '_id',
  'operationType',
  'clusterTime',
  'txnNumber',
  'lsid',
  'ns',
  'documentKey',
  'fullDocument',
  'updateDescription'
])

const isWatchChangeEventPath = (key: string) => {
  if (watchChangeEventRootKeys.has(key)) return true
  return (
    key.startsWith('ns.') ||
    key.startsWith('documentKey.') ||
    key.startsWith('fullDocument.') ||
    key.startsWith('updateDescription.')
  )
}

const isWatchOpaqueChangeEventObjectKey = (key: string) =>
  key === 'ns' ||
  key === 'documentKey' ||
  key === 'fullDocument' ||
  key === 'updateDescription'

export const toWatchMatchFilter = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => toWatchMatchFilter(item))
  }

  if (!isTraversablePlainObject(value)) return value

  return Object.entries(value).reduce<Record<string, unknown>>((acc, [key, current]) => {
    if (key.startsWith('$')) {
      acc[key] = toWatchMatchFilter(current)
      return acc
    }

    if (isWatchOpaqueChangeEventObjectKey(key)) {
      acc[key] = current
      return acc
    }

    if (isWatchChangeEventPath(key)) {
      acc[key] = toWatchMatchFilter(current)
      return acc
    }

    acc[`fullDocument.${key}`] = toWatchMatchFilter(current)
    return acc
  }, {})
}

const assertSafeWatchMatch = (value: unknown): void => {
  if (Array.isArray(value)) return value.forEach(assertSafeWatchMatch)
  if (!isTraversablePlainObject(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (['$where', '$function', '$accumulator', '$expr'].includes(key)) {
      throw new Error(`Watch filter ${key} is not supported`)
    }
    assertSafeWatchMatch(child)
  }
}

const toWatchDocumentFilter = (query: Document, root: string): Document => {
  assertSafeWatchMatch(query)
  return Object.fromEntries(Object.entries(query).map(([key, value]) => {
    if (['$and', '$or', '$nor'].includes(key)) {
      if (!Array.isArray(value)) throw new Error('Invalid watch access filter')
      return [key, value.map((child) => toWatchDocumentFilter(child, root))]
    }
    if (key.startsWith('$')) throw new Error(`Watch access filter ${key} is not supported`)
    return [`${root}.${key}`, value]
  }))
}

type RealmCompatibleWatchOptions = Document & {
  filter?: MongoFilter<Document>
  ids?: unknown[]
}

const resolveWatchArgs = (
  pipelineOrOptions?: Document[] | RealmCompatibleWatchOptions,
  options?: RealmCompatibleWatchOptions
) => {
  const inputPipeline = Array.isArray(pipelineOrOptions) ? pipelineOrOptions : []
  const rawOptions =
    (Array.isArray(pipelineOrOptions) ? options : pipelineOrOptions) ?? {}

  if (!isPlainObject(rawOptions)) {
    return {
      pipeline: inputPipeline,
      options: options as ChangeStreamOptions | undefined,
      extraMatches: [] as Document[]
    }
  }

  const {
    filter: watchFilter,
    ids,
    ...watchOptions
  } = rawOptions as RealmCompatibleWatchOptions

  const extraMatches: Document[] = []
  if (typeof watchFilter !== 'undefined') {
    extraMatches.push({ $match: toWatchMatchFilter(watchFilter) as Document })
  }
  if (Array.isArray(ids)) {
    extraMatches.push({
      $match: {
        $or: [{ 'documentKey._id': { $in: ids } }, { 'fullDocument._id': { $in: ids } }]
      }
    })
  }

  return {
    pipeline: inputPipeline,
    options: watchOptions as ChangeStreamOptions,
    extraMatches
  }
}

const hasAtomicOperators = (data: Document) =>
  Object.keys(data).some((key) => key.startsWith('$'))

const normalizeUpdatePayload = (data: Document) =>
  hasAtomicOperators(data) ? data : { $set: data }

const hasOperatorExpressions = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) && Object.keys(value).some((key) => key.startsWith('$'))

const matchesPullCondition = (item: unknown, operand: unknown) => {
  if (!isPlainObject(operand)) return isEqual(item, operand)
  if (hasOperatorExpressions(operand)) {
    if (Array.isArray((operand as { $in?: unknown }).$in)) {
      return (operand as { $in: unknown[] }).$in.some((candidate) =>
        isEqual(candidate, item)
      )
    }
    return false
  }
  return Object.entries(operand).every(([key, value]) => isEqual(get(item, key), value))
}

const applyDocumentUpdateOperators = (
  baseDocument: Document,
  update: Document
): Document => {
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
          if (
            isPlainObject(value) &&
            Array.isArray((value as { $each?: unknown[] }).$each)
          ) {
            targetArray.push(...(value as { $each: unknown[] }).$each)
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
          const filtered = currentValue.filter(
            (entry) => !matchesPullCondition(entry, value)
          )
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
          if (
            typeof currentValue === 'undefined' ||
            comparableCurrent > comparableValue
          ) {
            set(updated, path, value)
          }
        })
        break
      case '$max':
        Object.entries(payload).forEach(([path, value]) => {
          const currentValue = get(updated, path)
          const comparableCurrent = currentValue as any
          const comparableValue = value as any
          if (
            typeof currentValue === 'undefined' ||
            comparableCurrent < comparableValue
          ) {
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

const supportedUpsertOperators = new Set([
  '$set',
  '$setOnInsert',
  '$unset',
  '$inc',
  '$rename',
  '$push'
])

const checkUpsertValue = (value: unknown) => {
  if (['undefined', 'function', 'symbol', 'bigint'].includes(typeof value)) {
    throw new Error('Upsert value cannot be validated')
  }
  if (Array.isArray(value)) {
    for (const entry of value) checkUpsertValue(entry)
  } else if (isTraversablePlainObject(value)) {
    Object.values(value).forEach(checkUpsertValue)
  } else if (
    value !== null &&
    typeof value === 'object' &&
    (!(
      value instanceof Date ||
      value instanceof BSON.ObjectId ||
      value instanceof BSON.Decimal128 ||
      value instanceof BSON.Binary
    ) ||
      (value instanceof Date && !Number.isFinite(value.getTime())) ||
      typeof (value as { toBSON?: unknown }).toBSON !== 'undefined')
  ) {
    throw new Error('Upsert value cannot be validated')
  }
}

const checkUpsertPath = (path: string) => {
  if (
    path
      .split('.')
      .some(
        (part) =>
          !part ||
          part.startsWith('$') ||
          /[\[\]]/.test(part) ||
          /^\d+$/.test(part) ||
          ['__proto__', 'constructor', 'prototype'].includes(part)
      )
  ) {
    throw new Error('Upsert path cannot be validated')
  }
}

const buildUpsertDocument = (query: Document[], update: Document): Document => {
  checkUpsertValue(query)
  checkUpsertValue(update)
  const seed: Document = {}
  // MongoDB seeds an upsert from query equalities, including access filters.
  // Reject other query shapes rather than authorize an incomplete candidate.
  const addEqualities = (clause: Document) => {
    for (const [path, condition] of Object.entries(clause)) {
      if (path === '$and' && Array.isArray(condition)) {
        condition.forEach((entry) => {
          if (!isTraversablePlainObject(entry)) {
            throw new Error('Upsert filter cannot be validated')
          }
          addEqualities(entry)
        })
        continue
      }
      checkUpsertPath(path)
      let value = condition
      if (hasOperatorExpressions(condition)) {
        if (Object.keys(condition).length !== 1 || Object.keys(condition)[0] !== '$eq') {
          throw new Error('Upsert filter cannot be validated')
        }
        value = condition.$eq
      }
      set(seed, path, cloneDeep(value))
    }
  }
  query.forEach(addEqualities)

  for (const [operator, payload] of Object.entries(update)) {
    if (!supportedUpsertOperators.has(operator) || !isTraversablePlainObject(payload)) {
      throw new Error('Upsert update cannot be validated')
    }
    for (const [path, value] of Object.entries(payload)) {
      checkUpsertPath(path)
      if (operator === '$rename') {
        if (typeof value !== 'string') {
          throw new Error('Upsert path cannot be validated')
        }
        checkUpsertPath(value)
      }
      if (operator === '$inc' && (typeof value !== 'number' || !Number.isFinite(value))) {
        throw new Error('Upsert update cannot be validated')
      }
      if (
        operator === '$push' &&
        hasOperatorExpressions(value) &&
        (Object.keys(value).length !== 1 || !Array.isArray(value.$each))
      ) {
        throw new Error('Upsert update cannot be validated')
      }
    }
  }

  const insertSeed = applyDocumentUpdateOperators(seed, {
    $set: update.$setOnInsert ?? {}
  })
  return applyDocumentUpdateOperators(insertSeed, update)
}

const getUpdatedPaths = (update: Document) => {
  const entries = Object.entries(update ?? {})
  const hasOperators = entries.some(([key]) => key.startsWith('$'))

  if (!hasOperators) {
    return Object.keys(update ?? {})
  }

  const paths = new Set<string>()
  for (const [key, value] of entries) {
    if (!key.startsWith('$') || key === '$setOnInsert') continue
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.keys(value as Document).forEach((path) => paths.add(path))
      if (key === '$rename') {
        Object.values(value).forEach((path) => {
          if (typeof path === 'string') paths.add(path)
        })
      }
    }
  }
  return [...paths]
}

const updatePipelineStages = new Set([
  '$addFields', '$set', '$project', '$unset', '$replaceRoot', '$replaceWith'
])

const ensureUpdatePipelineStages = (pipeline: Document[]) => {
  for (const stage of pipeline) {
    if (
      !isTraversablePlainObject(stage) ||
      Object.keys(stage).length !== 1 ||
      !updatePipelineStages.has(Object.keys(stage)[0])
    ) {
      throw new Error('Update pipeline stage not permitted')
    }
  }
}

const getWriteSelectionOptions = (options?: Document): FindOneOptions | undefined => {
  if (!options) return undefined
  const selected: Document = {}
  for (const key of ['sort', 'collation', 'session', 'hint', 'let', 'maxTimeMS', 'comment']) {
    if (typeof options[key] !== 'undefined') selected[key] = options[key]
  }
  return Object.keys(selected).length ? selected : undefined
}

// Case-insensitive collations can merge different tenants or pinned string IDs.
// User-mode authorization and the final write must both use binary equality.
const getUserWriteOptions = (options?: Document) => ({
  ...options,
  collation: { locale: 'simple' }
})

const pinWriteQuery = (query: Document[], ids: unknown[]) =>
  buildAndQuery([...query, { _id: ids.length === 1 ? ids[0] : { $in: ids } }])

const getFieldWritePermission = (role: Role, field: string) => {
  if (role.fields?.[field]) return role.fields[field]
  const additional = role.additional_fields
  if (!additional) return undefined
  const fieldPermission = (additional as Record<string, FieldPermissionExpression>)[field]
  if (fieldPermission && ('write' in fieldPermission || 'read' in fieldPermission)) {
    return fieldPermission
  }
  return 'write' in additional || 'read' in additional
    ? additional as FieldPermissionExpression
    : undefined
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

const appendDistinctValue = (values: unknown[], candidate: unknown) => {
  if (typeof candidate === 'undefined') return
  if (!values.some((entry) => isEqual(entry, candidate))) {
    values.push(candidate)
  }
}

const collectDistinctValues = (documents: Document[], key: string) =>
  documents.reduce<unknown[]>((values, document) => {
    const currentValue = get(document, key)

    if (Array.isArray(currentValue)) {
      currentValue.forEach((entry) => appendDistinctValue(values, entry))
      return values
    }

    appendDistinctValue(values, currentValue)
    return values
  }, [])

const getOperators: GetOperatorsFunction = (
  mongo,
  { rules, dbName, collName, user, run_as_system, monitoringOrigin }
) => {
  const normalizedRules: Rules = rules ?? ({} as Rules)
  const collectionRules = run_as_system
    ? undefined
    : getCollectionRules(normalizedRules, dbName, collName)
  const collection = mongo.client.db(dbName).collection(collName)
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

  const validateReadableDocument = async (currentDoc: Document) => {
    const winningRole = await getWinningRoleAsync(currentDoc, user, roles)

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
          expansions: getValidationExpansions(currentDoc)
        },
        user
      )
      : fallbackAccess(currentDoc)

    return status ? document : undefined
  }

  const getScopedQuery = (query: MongoFilter<Document> = {}) => {
    const formattedQuery = getFormattedQuery(filters, query, user)
    const currentQuery = formattedQuery.length ? { $and: formattedQuery } : {}
    const safeQuery = Array.isArray(formattedQuery)
      ? normalizeQuery(formattedQuery)
      : formattedQuery

    return {
      formattedQuery,
      currentQuery,
      safeQuery,
      builtQuery: buildAndQuery(safeQuery)
    }
  }

  const validateInsertDocument = async (candidate: Document, message: string) => {
    const winningRole = await getWinningRoleAsync(candidate, user, roles)
    const params = {
      type: 'insert' as const, roles, cursor: candidate,
      expansions: getValidationExpansions()
    }
    if (!winningRole || !(await evaluateExpression(params, winningRole.insert, user))) {
      throw new Error(message)
    }
    const { status, document } = await checkValidation(winningRole, params, user)
    if (!status || !isEqual(candidate, document)) throw new Error(message)
  }

  const validateUpsertCandidate = async (query: Document[], update: Document) => {
    checkDenyOperation(normalizedRules, collection.collectionName, CRUD_OPERATIONS.CREATE)
    const candidate = buildUpsertDocument(query, update)
    await validateInsertDocument(candidate, 'Update not permitted')
    return candidate
  }

  const insertUpsertCandidate = async (candidate: Document, options?: Document) => {
    const insertOptions: Document = {}
    for (const key of ['session', 'writeConcern', 'bypassDocumentValidation', 'comment', 'timeoutMS']) {
      if (typeof options?.[key] !== 'undefined') insertOptions[key] = options[key]
    }
    // Insert the validated document directly: an upsert on the original filter could
    // otherwise update a different document that appears after the permission check.
    const result = await collection.insertOne(candidate, insertOptions)
    return {
      document: { ...candidate, _id: result.insertedId },
      result: {
        acknowledged: result.acknowledged,
        matchedCount: 0,
        modifiedCount: 0,
        upsertedCount: 1,
        upsertedId: result.insertedId
      }
    }
  }

  const validateDocumentUpdate = async (
    previous: Document,
    updated: Document,
    updatedPaths: string[],
    winningRole: Role | null
  ) => {
    if (!winningRole || !updated) throw new Error('Update not permitted')
    const params = {
      type: 'write' as const,
      roles,
      cursor: updated,
      expansions: getValidationExpansions(previous)
    }
    const { status, document } = await checkValidation(winningRole, params, user)
    if (!status || !areUpdatedFieldsAllowed(document, updated, updatedPaths)) {
      throw new Error('Update not permitted')
    }
    // Deleted fields are absent from the filtered document. Authorize each touched
    // field explicitly so that a missing forbidden value cannot compare equal to itself.
    if (typeof winningRole.write === 'undefined') {
      const fields = new Set(updatedPaths.map((path) => path.split('.')[0]))
      for (const field of fields) {
        const permission = getFieldWritePermission(winningRole, field)
        if (!permission || !(await evaluateExpression(params, permission.write, user))) {
          throw new Error('Update not permitted')
        }
      }
    }
  }

  const countReadableDocuments = async (query: Document, options?: Document) => {
    if (run_as_system) return collection.countDocuments(query, options)
    const pipeline = buildAuthorizedReadPipeline({
      pipeline: [{ $match: query }, { $count: 'count' }],
      rules: normalizedRules, user, dbName, collName
    })
    const { skip, limit, ...aggregateOptions } = options ?? {}
    // Count limits apply to authorized matches, before the count stage.
    if (skip) pipeline.splice(pipeline.length - 1, 0, { $skip: skip })
    if (limit) pipeline.splice(pipeline.length - 1, 0, { $limit: limit })
    const result = await collection.aggregate(pipeline, {
      ...aggregateOptions, collation: { locale: 'simple' }
    }).toArray()
    return result[0]?.count ?? 0
  }

  const operators: ReturnType<GetOperatorsFunction> = {
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
        const resolvedQuery = query ?? {}
        if (!run_as_system) {
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.READ
          )
          // Apply access control filters to the query
          const formattedQuery = getFormattedQuery(filters, resolvedQuery, user)
          // Rules-level projection has priority over client-provided projection.
          // The merged projection is passed natively to MongoDB.
          const rulesProjection = getFormattedProjection(filters, user)
          const finalProjection = mergeProjections(projection, rulesProjection)
          projectReadableDocument({}, finalProjection)
          const resolvedOptions = authorizedReadOptions(normalizedOptions)
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
          const result = await collection.findOne(
            buildAndQuery(safeQuery),
            resolvedOptions
          )
          logDebug('findOne result', {
            collection: collName,
            result
          })
          logService('findOne result', { collName, result })

          if (result === null) {
            emitMongoEvent('findOne')
            return null
          }

          const winningRole = await getWinningRoleAsync(result, user, roles)

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
                expansions: getValidationExpansions(result)
              },
              user
            )
            : fallbackAccess(result)

          // Return validated document or empty object if not permitted
          const response = status && document ? projectReadableDocument(document, finalProjection) : {}
          emitMongoEvent('findOne')
          return Promise.resolve(response)
        }
        // System mode: no validation applied, only client-provided projection/options.
        const systemOptions =
          projection || normalizedOptions
            ? {
              ...(normalizedOptions ?? {}),
              ...(projection ? { projection } : {})
            }
            : undefined
        const response = await collection.findOne(resolvedQuery, systemOptions)
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
          const userOptions = getUserWriteOptions(options)
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.DELETE
          )
          // Apply access control filters
          const formattedQuery = getFormattedQuery(filters, query, user)

          // Retrieve the document to check permissions before deleting
          const result = await collection.findOne(
            buildAndQuery(formattedQuery), getWriteSelectionOptions(userOptions)
          )
          const winningRole = await getWinningRoleAsync(result, user, roles)

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
                expansions: getValidationExpansions(result)
              },
              user
            )
            : fallbackAccess(result)

          if (!status) {
            throw new Error('Delete not permitted')
          }

          const res = await collection.deleteOne(buildAndQuery(formattedQuery), userOptions)
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
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.CREATE
          )
          await validateInsertDocument(data, 'Insert not permitted')
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
          const userOptions = getUserWriteOptions(options)
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.UPDATE
          )
          // Apply access control filters

          // Normalize _id
          const formattedQuery = getFormattedQuery(filters, query, user)
          const safeQuery = Array.isArray(formattedQuery)
            ? normalizeQuery(formattedQuery)
            : formattedQuery

          const result = await collection.findOne(
            buildAndQuery(safeQuery),
            getWriteSelectionOptions(userOptions)
          )

          if (!result) {
            if (!options?.upsert) throw new Error('Update not permitted')
            const candidate = await validateUpsertCandidate(safeQuery, normalizedData)
            const inserted = await insertUpsertCandidate(candidate, options)
            emitMongoEvent('updateOne')
            return inserted.result
          }

          const winningRole = await getWinningRoleAsync(result, user, roles)
          await validateDocumentUpdate(
            result,
            applyDocumentUpdateOperators(result, normalizedData),
            getUpdatedPaths(normalizedData),
            winningRole
          )
          const res = await collection.updateOne(
            pinWriteQuery(safeQuery, [result._id]),
            normalizedData,
            options?.upsert ? { ...userOptions, upsert: false } : userOptions
          )
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
          const userOptions = getUserWriteOptions(normalizedOptions)
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.UPDATE
          )
          const formattedQuery = getFormattedQuery(filters, query, user)
          const safeQuery = Array.isArray(formattedQuery)
            ? normalizeQuery(formattedQuery)
            : formattedQuery
          const normalizedData = Array.isArray(data)
            ? data
            : normalizeUpdatePayload(data as Document)
          if (Array.isArray(normalizedData)) ensureUpdatePipelineStages(normalizedData)
          const selectionOptions = getWriteSelectionOptions(userOptions)
          const currentDoc = await collection.findOne(buildAndQuery(safeQuery), selectionOptions)
          let updateResult: Document | null

          if (!currentDoc) {
            if (!normalizedOptions?.upsert || Array.isArray(normalizedData)) {
              throw new Error('Update not permitted')
            }
            const candidate = await validateUpsertCandidate(safeQuery, normalizedData)
            const inserted = await insertUpsertCandidate(candidate, normalizedOptions)
            updateResult = normalizedOptions.returnDocument === 'after' ? inserted.document : null
          } else {
            const winningRole = await getWinningRoleAsync(currentDoc, user, roles)
            if (!winningRole || winningRole.write === false) {
              throw new Error('Update not permitted')
            }
            const pinnedQuery = pinWriteQuery(safeQuery, [currentDoc._id])
            const [docToCheck] = Array.isArray(normalizedData)
              ? await collection.aggregate(
                [{ $match: pinnedQuery }, { $limit: 1 }, ...normalizedData],
                selectionOptions
                  ? { session: selectionOptions.session, collation: selectionOptions.collation, let: selectionOptions.let }
                  : undefined
              ).toArray()
              : [applyDocumentUpdateOperators(currentDoc, normalizedData)]
            const updatedPaths = Array.isArray(normalizedData)
              ? [...new Set([...Object.keys(currentDoc), ...Object.keys(docToCheck ?? {})])]
                .filter((path) => !isEqual(currentDoc[path], docToCheck?.[path]))
              : getUpdatedPaths(normalizedData)
            await validateDocumentUpdate(currentDoc, docToCheck, updatedPaths, winningRole)
            const writeOptions = normalizedOptions?.upsert
              ? { ...userOptions, upsert: false }
              : userOptions
            updateResult = writeOptions
              ? await collection.findOneAndUpdate(pinnedQuery, normalizedData, writeOptions)
              : await collection.findOneAndUpdate(pinnedQuery, normalizedData)
          }
          if (!updateResult) {
            emitMongoEvent('findOneAndUpdate')
            return updateResult
          }

          const readRole = await getWinningRoleAsync(updateResult, user, roles)
          const readResult = readRole
            ? await checkValidation(
              readRole,
              {
                type: 'read',
                roles,
                cursor: updateResult,
                expansions: getValidationExpansions(updateResult)
              },
              user
            )
            : fallbackAccess(updateResult)

          const sanitizedDoc = readResult.status
            ? (readResult.document ?? updateResult)
            : {}
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
    // Every cursor consumption validates complete documents before applying projections.
    find: (query = {}, projectionOrOptions, options) => {
      try {
        const { projection, options: normalizedOptions } = resolveFindArgs(
          projectionOrOptions,
          options
        )
        if (!run_as_system) {
          const scopeQuery = (input: Document) => getScopedQuery(input).builtQuery
          const scopeProjection = (value?: Document) => mergeProjections(value, getFormattedProjection(filters, user))
          const finalProjection = scopeProjection(projection)
          projectReadableDocument({}, finalProjection)
          const cursor = collection.find(scopeQuery(query), authorizedReadOptions(normalizedOptions))
          const authorized = createAuthorizedFindCursor({
            cursor, validateDocument: validateReadableDocument, scopeQuery,
            projection: finalProjection, scopeProjection
          })
          emitMongoEvent('find')
          return authorized
        }
        // System mode: return original unfiltered cursor (only client projection/options).
        const systemOptions =
          projection || normalizedOptions
            ? {
              ...(normalizedOptions ?? {}),
              ...(projection ? { projection } : {})
            }
            : undefined
        const cursor = collection.find(query, systemOptions)
        emitMongoEvent('find')
        return cursor
      } catch (error) {
        emitMongoEvent('find', undefined, error)
        throw error
      }
    },
    count: async (query = {}, options) => {
      try {
        const result = await countReadableDocuments(query, options)
        emitMongoEvent('count')
        return result
      } catch (error) {
        emitMongoEvent('count', undefined, error)
        throw error
      }
    },
    countDocuments: async (query = {}, options) => {
      try {
        const result = await countReadableDocuments(query, options)
        emitMongoEvent('countDocuments')
        return result
      } catch (error) {
        emitMongoEvent('countDocuments', undefined, error)
        throw error
      }
    },
    distinct: async (key, query = {}, options) => {
      try {
        if (!key) {
          throw new Error('distinct key is required')
        }

        if (!run_as_system) {
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.READ
          )

          const { currentQuery } = getScopedQuery(query)
          const documents = await collection.find(currentQuery, authorizedReadOptions(options)).toArray()
          const readableDocuments = (
            await Promise.all(documents.map((currentDoc) => validateReadableDocument(currentDoc)))
          ).filter(Boolean) as Document[]
          const result = collectDistinctValues(readableDocuments, key)

          emitMongoEvent('distinct')
          return result
        }

        const result =
          typeof options === 'undefined'
            ? await collection.distinct(key, query)
            : await collection.distinct(key, query, options)
        emitMongoEvent('distinct')
        return result
      } catch (error) {
        emitMongoEvent('distinct', undefined, error)
        throw error
      }
    },
    watch: (pipelineOrOptions = [], options) => {
      try {
        const { pipeline, options: watchOptions, extraMatches } = resolveWatchArgs(
          pipelineOrOptions as Document[] | RealmCompatibleWatchOptions,
          options as RealmCompatibleWatchOptions
        )
        const requestedPipeline = [...extraMatches, ...pipeline]
        const changestreamCollection = mongo[CHANGESTREAM].client.db(dbName).collection(collName)
        if (run_as_system) {
          const result = changestreamCollection.watch(requestedPipeline, watchOptions)
          emitMongoEvent('watch')
          return result
        }
        // Caller stages may filter events, but must not copy private document fields
        // into event metadata before authorization.
        for (const stage of requestedPipeline) {
          if (Object.keys(stage).length !== 1 || !isPlainObject(stage.$match)) {
            throw new Error('Only $match stages are permitted in user watch pipelines')
          }
          assertSafeWatchMatch(stage.$match)
        }
        const accessFilters = getFormattedQuery(filters, {}, user)
        const rootFilter = (root: string) => ({ $and: accessFilters.map((query) =>
          toWatchDocumentFilter(query, root)) })
        const guardedPipeline: Document[] = accessFilters.length ? [{ $match: { $or: [
          { $and: [{ operationType: { $ne: 'delete' } }, rootFilter('fullDocument')] },
          { $and: [{ operationType: 'delete' }, rootFilter('fullDocumentBeforeChange')] }
        ] } }, ...requestedPipeline] : requestedPipeline
        const stream = changestreamCollection.watch(guardedPipeline, {
          ...watchOptions,
          collation: { locale: 'simple' },
          fullDocument: 'updateLookup',
          fullDocumentBeforeChange: 'whenAvailable'
        })
        const result = authorizeWatch(stream, async (change) => {
          const isDelete = change.operationType === 'delete'
          const source = isDelete ? change.fullDocumentBeforeChange : change.fullDocument
          // A delete without a preimage cannot be attributed to an authorized document.
          if (!isPlainObject(source)) return undefined
          const document = await validateReadableDocument(source)
          if (!document) return undefined
          const event: Document = {
            _id: change._id,
            operationType: change.operationType,
            ns: { db: dbName, coll: collName },
            documentKey: { _id: source._id }
          }
          if (change.clusterTime) event.clusterTime = change.clusterTime
          if (isDelete) event.fullDocumentBeforeChange = document
          else event.fullDocument = document
          if (!isDelete && isPlainObject(change.updateDescription)) {
            const updates = Object.entries(change.updateDescription.updatedFields ?? {})
              .filter(([path, value]) =>
                Object.prototype.hasOwnProperty.call(document, path.split('.')[0]) &&
                isEqual(get(document, path), value))
            event.updateDescription = {
              updatedFields: Object.fromEntries(updates),
              // Removed paths cannot be checked against the post-update document.
              // The authorized fullDocument remains the authoritative new state.
              removedFields: [],
              truncatedArrays: []
            }
          }
          return event
        })
        emitMongoEvent('watch')
        return result
      } catch (error) {
        emitMongoEvent('watch', undefined, error)
        throw error
      }
    },
    aggregate: (pipeline = [], options) => {
      try {
        const guardedPipeline = run_as_system ? pipeline : buildAuthorizedReadPipeline({
          pipeline, rules: normalizedRules, user, dbName, collName
        })
        const cursor = collection.aggregate(guardedPipeline, run_as_system
          ? options : { ...options, collation: { locale: 'simple' } })
        emitMongoEvent('aggregate')
        return run_as_system ? cursor : authorizeAggregate(cursor, (stages) =>
          rewriteAuthorizedReadStages(stages, { rules: normalizedRules, user, dbName, collName }))
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
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.CREATE
          )
          await Promise.all(documents.map((document) =>
            validateInsertDocument(document, 'Insert not permitted')))

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
    bulkWrite: async (operations, options) => {
      try {
        if (!run_as_system) {
          throw new Error('bulkWrite is available only when run_as_system is enabled')
        }

        const result = await collection.bulkWrite(operations, options)
        emitMongoEvent('bulkWrite', { operations: operations.length })
        return result
      } catch (error) {
        emitMongoEvent(
          'bulkWrite',
          { operations: Array.isArray(operations) ? operations.length : 0 },
          error
        )
        throw error
      }
    },
    updateMany: async (query, data, options) => {
      try {
        const normalizedData = normalizeUpdatePayload(data as Document)
        if (!run_as_system) {
          const userOptions = getUserWriteOptions(options)
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.UPDATE
          )
          const { safeQuery, builtQuery } = getScopedQuery(query)
          const result = await collection.find(
            builtQuery,
            getWriteSelectionOptions(userOptions)
          ).toArray()
          if (!result.length && options?.upsert) {
            const candidate = await validateUpsertCandidate(safeQuery, normalizedData)
            const inserted = await insertUpsertCandidate(candidate, options)
            emitMongoEvent('updateMany')
            return inserted.result
          }

          const updatedPaths = getUpdatedPaths(normalizedData)
          await Promise.all(result.map(async (previous) => {
            const winningRole = await getWinningRoleAsync(previous, user, roles)
            await validateDocumentUpdate(
              previous,
              applyDocumentUpdateOperators(previous, normalizedData),
              updatedPaths,
              winningRole
            )
          }))

          const res = await collection.updateMany(
            pinWriteQuery(safeQuery, result.map((document) => document._id)),
            normalizedData,
            options?.upsert ? { ...userOptions, upsert: false } : userOptions
          )
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
          const userOptions = getUserWriteOptions(options)
          checkDenyOperation(
            normalizedRules,
            collection.collectionName,
            CRUD_OPERATIONS.DELETE
          )
          // Apply access control filters
          const formattedQuery = getFormattedQuery(filters, query, user)

          // Fetch documents matching the combined filters
          const data = await collection.find(
            { $and: formattedQuery }, getWriteSelectionOptions(userOptions)
          ).toArray()

          // Filter and validate each document based on user's roles
          const filteredItems = await Promise.all(
            data.map(async (currentDoc) => {
              const winningRole = await getWinningRoleAsync(currentDoc, user, roles)

              const { status, document } = winningRole
                ? await checkValidation(
                  winningRole,
                  {
                    type: 'delete',
                    roles,
                    cursor: currentDoc,
                    expansions: getValidationExpansions(currentDoc)
                  },
                  user
                )
                : fallbackAccess(currentDoc)

              return status ? document : undefined
            })
          )

          // Extract IDs of documents that passed validation
          const elementsToDelete = (
            filteredItems.filter(Boolean) as WithId<Document>[]
          ).map(({ _id }) => _id)

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
          const result = await collection.deleteMany(deleteQuery, userOptions)
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

  return operators
}

const MongodbAtlas: MongodbAtlasFunction = (
  app,
  { rules, user, run_as_system, monitoring } = {}
) => ({
  startSession: (options?: ClientSessionOptions) => {
    if (!run_as_system) throw new Error('startSession requires run_as_system')
    const mongoClient = app.mongo.client as unknown as {
      startSession: (sessionOptions?: ClientSessionOptions) => ClientSession
    }
    return mongoClient.startSession(options)
  },
  db: (dbName: string) => {
    return {
      collection: (collName: string) => {
        return getOperators(app.mongo, {
          dbName,
          collName,
          rules,
          user,
          run_as_system,
          monitoringOrigin: monitoring?.invokedFrom
        })
      }
    }
  }
})

export default MongodbAtlas
