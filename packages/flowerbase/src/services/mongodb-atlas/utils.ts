import { ObjectId } from 'mongodb'

import { Collection, Document, Filter as FilterMongoDB } from 'mongodb'
import { User } from '../../auth/dtos'
import {
  AggregationPipeline,
  AggregationPipelineStage,
  Filter,
  LookupStage,
  Projection,
  Rules,
  STAGES_TO_SEARCH,
  UnionWithStage
} from '../../features/rules/interface'
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
  query: Parameters<Collection<Document>['findOne']>[0],
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
  const projections = filters
    .filter((filter) => {
      if (filter.projection) {
        const preFilter = getValidRule({ filters, user })
        const isValidPreFilter = !!preFilter?.length
        return isValidPreFilter
      }
      return false
    })
    .map((f) => f.projection)
  if (!projections.length) return null
  return Object.assign({}, ...projections)
}

export const applyAccessControlToPipeline = (
  pipeline: AggregationPipeline,
  rules: Record<
    string,
    {
      filters?: Filter[]
      roles?: Role[]
    }
  >,
  user: User,
  collectionName: string,
  options?: {
    isClientPipeline?: boolean
  }
): AggregationPipeline => {
  const { isClientPipeline = false } = options || {}
  const hiddenFieldsForCollection = isClientPipeline
    ? getHiddenFieldsFromRulesConfig(rules[collectionName])
    : []

  return pipeline.map((stage) => {
    const [stageName] = Object.keys(stage)
    const value = stage[stageName as keyof typeof stage]

    if (stageName === STAGES_TO_SEARCH.LOOKUP) {
      const lookUpStage = value as LookupStage
      const currentCollection = lookUpStage.from
      checkDenyOperation(rules as Rules, currentCollection, CRUD_OPERATIONS.READ)
      const lookupRules = rules[currentCollection] || {}
      const formattedQuery = getFormattedQuery(lookupRules.filters, {}, user)
      const projection = getFormattedProjection(lookupRules.filters)

      const nestedPipeline = applyAccessControlToPipeline(
        lookUpStage.pipeline || [],
        rules,
        user,
        currentCollection,
        { isClientPipeline }
      )

      const lookupPipeline = [
        ...(formattedQuery.length ? [{ $match: { $and: formattedQuery } }] : []),
        ...(projection ? [{ $project: projection }] : []),
        ...nestedPipeline
      ]

      const pipelineWithHiddenFields = isClientPipeline
        ? prependUnsetStage(lookupPipeline, getHiddenFieldsFromRulesConfig(lookupRules))
        : lookupPipeline

      return {
        $lookup: {
          ...lookUpStage,
          pipeline: pipelineWithHiddenFields
        }
      }
    }

    if (stageName === STAGES_TO_SEARCH.UNION_WITH) {
      const unionWithStage = value as UnionWithStage
      const isSimpleStage = typeof unionWithStage === 'string'
      const currentCollection = isSimpleStage ? unionWithStage : unionWithStage.coll
      checkDenyOperation(rules as Rules, currentCollection, CRUD_OPERATIONS.READ)
      const unionRules = rules[currentCollection] || {}
      const formattedQuery = getFormattedQuery(unionRules.filters, {}, user)
      const projection = getFormattedProjection(unionRules.filters)

      if (isSimpleStage) {
        return stage
      }

      const nestedPipeline = unionWithStage.pipeline || []

      const sanitizedNestedPipeline = applyAccessControlToPipeline(
        nestedPipeline,
        rules,
        user,
        currentCollection,
        { isClientPipeline }
      )

      const unionPipeline = [
        ...(formattedQuery.length ? [{ $match: { $and: formattedQuery } }] : []),
        ...(projection ? [{ $project: projection }] : []),
        ...sanitizedNestedPipeline
      ]

      const pipelineWithHiddenFields = isClientPipeline
        ? prependUnsetStage(unionPipeline, getHiddenFieldsFromRulesConfig(unionRules))
        : unionPipeline

      return {
        $unionWith: {
          ...unionWithStage,
          pipeline: pipelineWithHiddenFields
        }
      }
    }

    if (stageName === STAGES_TO_SEARCH.FACET) {
      const modifiedFacets = Object.fromEntries(
        (Object.entries(value) as [string, AggregationPipelineStage[]][]).map(
          ([facetKey, facetPipeline]) => {
            const sanitizedFacetPipeline = applyAccessControlToPipeline(
              facetPipeline,
              rules,
              user,
              collectionName,
              { isClientPipeline }
            )
            const facetPipelineWithHiddenFields = isClientPipeline
              ? prependUnsetStage(sanitizedFacetPipeline, hiddenFieldsForCollection)
              : sanitizedFacetPipeline
            return [facetKey, facetPipelineWithHiddenFields]
          }
        )
      )

      return { $facet: modifiedFacets }
    }

    return stage
  })
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

export function normalizeQuery(query: FilterMongoDB<Document>[]) {
  return query.map((cond) => {
    const newCond = { ...cond }
    if (newCond._id && typeof newCond._id === 'string' && ObjectId.isValid(newCond._id)) {
      newCond._id = new ObjectId(newCond._id)
    }
    return newCond
  })
}

export const getCollectionsFromPipeline = (pipeline: Document[]) => {
  return pipeline.reduce<string[]>((acc, stage) => {
    const [stageKey] = Object.keys(stage)
    const stageValue = stage[stageKey]
    const subPipeline = stageValue?.pipeline

    if (stageKey === STAGES_TO_SEARCH.LOOKUP) {
      acc.push(...[stageValue.from, ...acc])
      if (subPipeline) {
        const collections = getCollectionsFromPipeline(subPipeline)
        acc.push(...[stageValue.from, ...collections])
      }
    }

    if (stageKey === STAGES_TO_SEARCH.FACET) {
      for (const sub of Object.values(stageValue) as Document[][]) {
        const collections = getCollectionsFromPipeline(sub)
        acc.push(...collections)
      }
    }

    if (
      stageKey === STAGES_TO_SEARCH.UNION_WITH &&
      typeof stageValue === 'object' &&
      subPipeline
    ) {
      const collections = getCollectionsFromPipeline(subPipeline)
      acc.push(...[stageValue.coll, ...collections])
    }

    return acc
  }, [])
}

const CLIENT_STAGE_BLACKLIST = new Set([
  '$replaceRoot',
  '$merge',
  '$out',
  '$function',
  '$where',
  '$accumulator',
  '$graphLookup'
])

export function ensureClientPipelineStages(pipeline: AggregationPipeline) {
  pipeline.forEach((stage) => {
    const [stageName] = Object.keys(stage)
    if (!stageName) return

    if (CLIENT_STAGE_BLACKLIST.has(stageName)) {
      throw new Error(`Stage ${stageName} is not allowed in client aggregate pipelines`)
    }

    const value = stage[stageName as keyof typeof stage]

    if (stageName === STAGES_TO_SEARCH.LOOKUP) {
      ensureClientPipelineStages((value as LookupStage).pipeline || [])
      return
    }

    if (stageName === STAGES_TO_SEARCH.UNION_WITH) {
      if (typeof value === 'string') {
        throw new Error('$unionWith must provide a pipeline when called from the client')
      }
      const unionStage = value as { pipeline?: AggregationPipeline }
      ensureClientPipelineStages(unionStage.pipeline || [])
      return
    }

    if (stageName === STAGES_TO_SEARCH.FACET) {
      Object.values(value as Record<string, AggregationPipeline>).forEach((facetPipeline) =>
        ensureClientPipelineStages(facetPipeline)
      )
    }
  })
}

export function getHiddenFieldsFromRulesConfig(rulesConfig?: { roles?: Role[] }) {
  if (!rulesConfig) {
    return []
  }
  return collectHiddenFieldsFromRoles(rulesConfig.roles)
}

function collectHiddenFieldsFromRoles(roles: Role[] = []) {
  const hiddenFields = new Set<string>()

  const collectFromFields = (
    fields?: Role['fields'] | Role['additional_fields']
  ) => {
    if (!fields) return
    Object.entries(fields).forEach(([fieldName, permissions]) => {
      const canRead = Boolean(permissions?.read || permissions?.write)
      if (!canRead) {
        hiddenFields.add(fieldName)
      }
    })
  }

  roles.forEach((role) => {
    collectFromFields(role.fields)
    collectFromFields(role.additional_fields)
  })

  return Array.from(hiddenFields)
}

export function prependUnsetStage(pipeline: AggregationPipeline, hiddenFields: string[]) {
  if (!hiddenFields.length) {
    return pipeline
  }
  return [{ $unset: hiddenFields }, ...pipeline]
}
