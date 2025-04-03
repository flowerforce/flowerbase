
import { Collection, Document } from 'mongodb'
import { User } from '../../auth/dtos'
import { Filter } from '../../features/rules/interface'
import { Role } from '../../utils/roles/interface'
import { expandQuery } from '../../utils/rules'
import rulesMatcherUtils from '../../utils/rules-matcher/utils'
import { GetValidRuleParams } from './model'

export const getValidRule = <T extends Role | Filter>({
  filters = [],
  user,
  record = null
}: GetValidRuleParams<T>) => {
  if (!filters.length) return []
  return filters.filter((f) => {
    if (Object.keys(f.apply_when).length === 0) return true
    const conditions = expandQuery(f.apply_when, {
      '%%user': user,
      '%%true': true
      /** values */
    })
    const valid = rulesMatcherUtils.checkRule(
      conditions,
      {
        ...(record ?? {}),
        '%%user': user
      },
      {}
    )

    return valid
  })
}


export const getFormattedQuery = (filters: Filter[] = [], query: Parameters<Collection<Document>['findOne']>[0], user?: User) => {
  const preFilter = getValidRule({ filters, user })
  const isValidPreFilter = !!preFilter?.length
  return [
    isValidPreFilter && expandQuery(preFilter[0].query, { '%%user': user }),
    query
  ].filter(Boolean)
}