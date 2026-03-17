import { services } from '../../services'
import { StateManager } from '../../state'
import { GenerateContext } from '../context'
import { expandQuery } from '../rules'
import rulesMatcherUtils from '../rules-matcher/utils'
import { PermissionExpression } from './interface'
import { MachineContext } from './machines/interface'

const functionsConditions = ['%%true', '%%false']

const normalizeUserRole = (user?: MachineContext['user']) => {
  if (!user) return user
  if (typeof user !== 'object') return user
  const candidate = user as Record<string, unknown>
  if (typeof candidate.role === 'string') return user
  const customRole =
    typeof candidate.custom_data === 'object' && candidate.custom_data !== null
      ? (candidate.custom_data as Record<string, unknown>).role
      : undefined
  return typeof customRole === 'string'
    ? ({ ...candidate, role: customRole } as MachineContext['user'])
    : user
}

export const evaluateExpression = async (
  params: MachineContext['params'],
  expression?: PermissionExpression,
  user?: MachineContext['user']
): Promise<boolean> => {
  if (!expression || typeof expression === 'boolean') return !!expression
  const normalizedUser = normalizeUserRole(user)

  const value = {
    ...params.expansions,
    ...params.cursor,
    '%%root': params.cursor,
    '%%prevRoot': params.expansions?.['%%prevRoot'],
    '%%user': normalizedUser,
    '%%true': true,
    '%%false': false
  }
  const conditions = expandQuery(expression, value)
  const complexCondition = Object.entries(conditions as Record<string, any>).find(
    ([key]) => functionsConditions.includes(key)
  )
  return complexCondition
    ? await evaluateComplexExpression(complexCondition, params, normalizedUser)
    : rulesMatcherUtils.checkRule(conditions, value, {})
}

const evaluateComplexExpression = async (
  condition: [string, Record<string, any>],
  params: MachineContext['params'],
  user: MachineContext['user']
): Promise<boolean> => {
  const [key, config] = condition
  const normalizedUser = normalizeUserRole(user)

  const functionConfig = config['%function']
  const { name, arguments: fnArguments } = functionConfig
  const functionsList = StateManager.select('functions')
  const app = StateManager.select('app')
  const currentFunction = functionsList[name]

  const expansionContext = {
    ...params.expansions,
    ...params.cursor,
    '%%root': params.cursor,
    '%%user': normalizedUser,
    '%%true': true,
    '%%false': false
  }

  const expandedArguments =
    fnArguments && fnArguments.length
      ? ((expandQuery({ args: fnArguments }, expansionContext) as { args: unknown[] })
          .args ?? [])
      : [params.cursor]

  const response = await GenerateContext({
    args: expandedArguments,
    app,
    rules: StateManager.select('rules'),
    user: normalizedUser,
    currentFunction,
    functionName: name,
    functionsList,
    services
  })
  const isTruthy = Boolean(response)
  return key === '%%true' ? isTruthy : !isTruthy
}
