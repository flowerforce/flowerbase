import { ObjectId } from 'mongodb'

import { Collection, Document, Filter as FilterMongoDB } from 'mongodb'
import { User } from '../../auth/dtos'
import { Filter, Projection, Rules } from '../../features/rules/interface'
import { Role } from '../../utils/roles/interface'
import { expandQuery } from '../../utils/rules'
import rulesMatcherUtils from '../../utils/rules-matcher/utils'
import { CRUD_OPERATIONS, GetValidRuleParams } from './model'

export const getValidRule = <T extends Role | Filter>({
  filters = [],
  user,
  record = null
}: GetValidRuleParams<T>) => {
  if (!filters.length) return []
  const rootRecord = record ?? null

  return filters.filter((f) => {
    if (Object.keys(f.apply_when).length === 0) return true

    // expandQuery traduce i placeholder (%%user, %%true)
    const conditions = expandQuery(f.apply_when, {
      '%%root': rootRecord,
      '%%user': user,
      '%%true': true
      /** values */
    })

    // checkRule valuta se i campi del record soddisfano quella condizione. 
    // Quindi le regole vengono effettivamente rispettate.
    const valid = rulesMatcherUtils.checkRule(
      conditions as Parameters<typeof rulesMatcherUtils.checkRule>[0],
      {
        ...(record ?? {}),
        '%%root': rootRecord,
        '%%user': user,
        '%%true': true
      },
      {}
    )

    return valid
  })
}

export const getFormattedQuery = (
  filters: Filter[] = [],
  query?: Parameters<Collection<Document>['findOne']>[0],
  user?: User
) => {
  const preFilter = getValidRule({ filters, user })
  const isValidPreFilter = !!preFilter?.length
  const formatted: FilterMongoDB<Document>[] = []
  if (isValidPreFilter) {
    formatted.push(
      expandQuery(preFilter[0].query, { '%%user': user }) as FilterMongoDB<Document>
    )
  }
  if (query && Object.keys(query).length > 0) {
    formatted.push(query as FilterMongoDB<Document>)
  }
  return formatted
}

export const getFormattedProjection = (
  filters: Filter[] = [],
  user?: User
): Projection | null => {
  const projections = getValidRule({ filters, user })
    .filter((f) => !!f.projection)
    .map((f) => f.projection as Projection)
  if (!projections.length) return null
  return Object.assign({}, ...projections)
}

/**
 * Merges a client-provided projection with the one computed from rules filters.
 *
 * Rules have higher priority over the client:
 * - If rules exclude a top-level field (e.g. `{ instock: 0 }`), every client
 *   reference to that field — including dotted sub-paths such as
 *   `"instock.qty": 1` — is dropped from the final projection.
 * - If rules include a field (value `1`), it is always part of the final
 *   projection and overrides any conflicting client value.
 * - The returned projection is always a valid MongoDB projection (no mixing of
 *   inclusion and exclusion on non-`_id` keys), so it can be passed as-is to
 *   native MongoDB methods.
 * - Returns `undefined` when neither side provided a meaningful projection.
 */
export const mergeProjections = (
  clientProjection: Projection | Document | undefined,
  rulesProjection: Projection | null | undefined
): Projection | Document | undefined => {
  const hasClient = !!clientProjection && Object.keys(clientProjection).length > 0
  const hasRules = !!rulesProjection && Object.keys(rulesProjection).length > 0
  if (!hasClient && !hasRules) return undefined

  const client = (hasClient ? (clientProjection as Projection) : {}) as Projection
  const rules = (hasRules ? (rulesProjection as Projection) : {}) as Projection

  const getTopLevel = (key: string) => key.split('.')[0]

  const rulesEntries = Object.entries(rules)
  const rulesIncludeKeys = rulesEntries
    .filter(([, value]) => value === 1)
    .map(([key]) => key)
  const rulesExcludeKeys = rulesEntries
    .filter(([, value]) => value === 0)
    .map(([key]) => key)

  // Top-level fields excluded by rules (excluding `_id` which has special
  // MongoDB semantics and is allowed alongside inclusion projections).
  const excludedTopLevel = new Set(
    rulesExcludeKeys.map(getTopLevel).filter((key) => key !== '_id')
  )

  const filteredClient: Record<string, 0 | 1> = {}
  for (const [key, value] of Object.entries(client)) {
    if (excludedTopLevel.has(getTopLevel(key))) continue
    filteredClient[key] = value as 0 | 1
  }

  const hasInclusion =
    rulesIncludeKeys.some((key) => key !== '_id') ||
    Object.entries(filteredClient).some(([key, value]) => value === 1 && key !== '_id')

  const merged: Record<string, 0 | 1> = {}

  if (hasInclusion) {
    // Inclusion mode: keep only client inclusions, then overlay rules inclusions.
    // Client exclusions (other than `_id: 0`) are incompatible with inclusion
    // mode and are dropped; not-included fields are implicitly excluded anyway.
    for (const [key, value] of Object.entries(filteredClient)) {
      if (value === 1 || key === '_id') merged[key] = value
    }
    for (const key of rulesIncludeKeys) merged[key] = 1
    // Allow `_id: 0` to be forced by rules in inclusion mode.
    for (const key of rulesExcludeKeys) {
      if (key === '_id') merged[key] = 0
    }
  } else {
    // Pure exclusion mode: combine all exclusions from both sides.
    for (const [key, value] of Object.entries(filteredClient)) {
      if (value === 0) merged[key] = 0
    }
    for (const key of rulesExcludeKeys) merged[key] = 0
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

export const checkDenyOperation = (
  rules: Rules,
  collectionName: string,
  operation: CRUD_OPERATIONS
) => {
  const collectionRules = rules[collectionName]
  if (!collectionRules) {
    throw new Error(`${operation} FORBIDDEN!`)
  }
}

export const getCollectionRules = (
  rules: Rules,
  databaseName: string,
  collectionName: string
) => {
  const config = Object.prototype.hasOwnProperty.call(rules, collectionName)
    ? rules[collectionName]
    : undefined
  if (
    !config || config.database !== databaseName || config.collection !== collectionName
  ) {
    throw new Error('Collection access not permitted')
  }
  return config
}

export function normalizeQuery(query: FilterMongoDB<Document>[]) {
  return query.map((cond) => {
    const newCond = { ...cond }
    if (newCond._id && typeof newCond._id === 'string' && ObjectId.isValid(newCond._id)) {
      newCond._id = new ObjectId(newCond._id)
    }
    return newCond
  })
}
