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

  return filters.filter((f) => {
    if (Object.keys(f.apply_when).length === 0) return true

    // expandQuery traduce i placeholder (%%user, %%true)
    const conditions = expandQuery(f.apply_when, {
      '%%user': user,
      '%%true': true
      /** values */
    })

    // checkRule valuta se i campi del record soddisfano quella condizione. 
    // Quindi le regole vengono effettivamente rispettate.
    const valid = rulesMatcherUtils.checkRule(
      conditions,
      {
        ...(record ?? {}),
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
  return [
    isValidPreFilter && expandQuery(preFilter[0].query, { '%%user': user }),
    query
  ].filter(Boolean).filter(r => Object.keys(r).length > 0)
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
  user: User
): AggregationPipeline => {
  return pipeline.map((stage) => {
    const [stageName] = Object.keys(stage)
    const value = stage[stageName as keyof typeof stage]

    // CASE LOOKUP
    if (stageName === STAGES_TO_SEARCH.LOOKUP) {
      const lookUpStage = value as LookupStage
      const currentCollection = lookUpStage.from
      const lookupRules = rules[currentCollection] || {}
      const formattedQuery = getFormattedQuery(lookupRules.filters, {}, user)
      const projection = getFormattedProjection(lookupRules.filters)

      return {
        $lookup: {
          ...lookUpStage,
          pipeline: [
            ...(formattedQuery.length ? [{ $match: { $and: formattedQuery } }] : []),
            ...(projection ? [{ $project: projection }] : []),
            ...applyAccessControlToPipeline(lookUpStage.pipeline || [], rules, user)
          ]
        }
      }
    }

    // CASE LOOKUP
    if (stageName === STAGES_TO_SEARCH.UNION_WITH) {
      const unionWithStage = value as UnionWithStage
      const isSimpleStage = typeof unionWithStage === 'string'
      const currentCollection = isSimpleStage ? unionWithStage : unionWithStage.coll
      const unionRules = rules[currentCollection] || {}
      const formattedQuery = getFormattedQuery(unionRules.filters, {}, user)
      const projection = getFormattedProjection(unionRules.filters)

      const nestedPipeline = isSimpleStage ? [] : unionWithStage.pipeline || []

      return {
        $unionWith: {
          coll: currentCollection,
          pipeline: [
            ...(formattedQuery.length ? [{ $match: { $and: formattedQuery } }] : []),
            ...(projection ? [{ $project: projection }] : []),
            ...applyAccessControlToPipeline(nestedPipeline, rules, user)
          ]
        }
      }
    }

    // CASE FACET
    if (stageName === STAGES_TO_SEARCH.FACET) {
      const modifiedFacets = Object.fromEntries(
        (Object.entries(value) as [string, AggregationPipelineStage[]][]).map(
          ([facetKey, facetPipeline]) => {
            return [facetKey, applyAccessControlToPipeline(facetPipeline, rules, user)]
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
