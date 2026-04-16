import { services } from '../../services'
import { StateManager } from '../../state'
import { GenerateContext } from '../context'
import { expandQuery } from '../rules'
import rulesMatcherUtils from '../rules-matcher/utils'
import { PermissionExpression } from './interface'
import { MachineContext } from './machines/interface'

const functionsConditions = ['%%true', '%%false']
const andConditions = ['$and', '%and']
const orConditions = ['$or', '%or']

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

const buildEvaluationContext = (
  params: MachineContext['params'],
  user?: MachineContext['user']
) => {
  const normalizedUser = normalizeUserRole(user)

  return {
    ...(params.expansions ?? {}),
    ...(params.cursor ?? {}),
    '%%root': params.cursor,
    '%%prevRoot': params.expansions?.['%%prevRoot'],
    '%%user': normalizedUser,
    '%%true': true,
    '%%false': false
  }
}

const getFunctionCondition = (
  expression: unknown
): [string, Record<string, any>] | null => {
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) {
    return null
  }

  const entries = Object.entries(expression as Record<string, unknown>)
  if (entries.length !== 1) {
    return null
  }

  const [key, value] = entries[0]
  if (!functionsConditions.includes(key)) {
    return null
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return Object.prototype.hasOwnProperty.call(value, '%function')
    ? [key, value as Record<string, any>]
    : null
}

export const evaluateExpandedExpression = async (
  expression: unknown,
  params: MachineContext['params'],
  user?: MachineContext['user']
): Promise<boolean> => {
  if (typeof expression === 'boolean') {
    return expression
  }

  if (!expression || typeof expression !== 'object') {
    return Boolean(expression)
  }

  const block = expression as Record<string, unknown>
  const functionCondition = getFunctionCondition(block)

  if (functionCondition) {
    return evaluateComplexExpression(functionCondition, params, user)
  }

  const andKey = andConditions.find((key) => Object.prototype.hasOwnProperty.call(block, key))
  if (andKey) {
    const conditions = Array.isArray(block[andKey]) ? (block[andKey] as unknown[]) : []
    if (!conditions.length) return true

    for (const condition of conditions) {
      if (!(await evaluateExpandedExpression(condition, params, user))) {
        return false
      }
    }

    return true
  }

  const orKey = orConditions.find((key) => Object.prototype.hasOwnProperty.call(block, key))
  if (orKey) {
    const conditions = Array.isArray(block[orKey]) ? (block[orKey] as unknown[]) : []
    if (!conditions.length) return true

    for (const condition of conditions) {
      if (await evaluateExpandedExpression(condition, params, user)) {
        return true
      }
    }

    return false
  }

  const keys = Object.keys(block)
  if (keys.length > 1) {
    for (const key of keys) {
      if (!(await evaluateExpandedExpression({ [key]: block[key] }, params, user))) {
        return false
      }
    }

    return true
  }

  return rulesMatcherUtils.checkRule(block as never, buildEvaluationContext(params, user), {})
}

export const evaluateExpression = async (
  params: MachineContext['params'],
  expression?: PermissionExpression,
  user?: MachineContext['user']
): Promise<boolean> => {
  if (!expression || typeof expression === 'boolean') return !!expression

  const value = buildEvaluationContext(params, user)
  const conditions = expandQuery(expression, value)
  return evaluateExpandedExpression(conditions, params, user)
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
