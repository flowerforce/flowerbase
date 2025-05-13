import { services } from '../../services'
import { StateManager } from '../../state'
import { GenerateContext } from '../context'
import { expandQuery } from '../rules'
import rulesMatcherUtils from '../rules-matcher/utils'
import { PermissionExpression } from './interface'
import { MachineContext } from './machines/interface'

const functionsConditions = ['%%true', '%%false']

export const evaluateExpression = async (
  params: MachineContext['params'],
  expression?: PermissionExpression,
  user?: MachineContext['user']
): Promise<boolean> => {
  if (!expression || typeof expression === 'boolean') return !!expression

  const value = {
    ...params.expansions,
    ...params.cursor,
    '%%user': user,
    '%%true': true
  }
  const conditions = expandQuery(expression, value)
  const complexCondition = Object.entries<Record<string, any>>(conditions).find(([key]) =>
    functionsConditions.includes(key)
  )
  return complexCondition
    ? await evaluateComplexExpression(complexCondition, params, user)
    : rulesMatcherUtils.checkRule(conditions, value, {})
}

const evaluateComplexExpression = async (
  condition: [string, Record<string, any>],
  params: MachineContext['params'],
  user: MachineContext['user']
) => {
  const [key, config] = condition

  const { name } = config['%function']
  const functionsList = StateManager.select('functions')
  const app = StateManager.select('app')
  const currentFunction = functionsList[name]
  const response = await GenerateContext({
    args: [params.cursor],
    app,
    rules: {},
    user,
    currentFunction,
    functionsList,
    services
  })
  return key === '%%true' ? response : !response
}
