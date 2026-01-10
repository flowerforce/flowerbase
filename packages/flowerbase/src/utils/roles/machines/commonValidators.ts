import { someAsync } from '../../helpers/someAsync'
import { evaluateExpression } from '../helpers'
import { DocumentFiltersPermissions } from '../interface'
import { MachineContext } from './interface'

const readOnlyPermissions = ['read', 'search']
const readWritePermissions = ['write', 'delete', 'insert', ...readOnlyPermissions]

export const evaluateDocumentFiltersFn = async (
  { params, role, user }: MachineContext,
  currentType: keyof DocumentFiltersPermissions
) => {
  const permissions = currentType === 'read' ? readOnlyPermissions : readWritePermissions
  return await someAsync(
    [permissions.includes(params.type) && role.document_filters?.[currentType]].filter(
      Boolean
    ),
    async (expr) => evaluateExpression(params, expr, user)
  )
}

export const evaluateTopLevelPermissionsFn = async (
  { params, role, user }: MachineContext,
  currentType: MachineContext['params']['type']
) => {
  const permission = role?.[currentType]
  if (typeof permission === 'undefined') {
    return undefined
  }

  return await evaluateExpression(params, permission, user)
}

export const checkFieldsPropertyExists = ({ role }: MachineContext) => {
  const hasFields = !!Object.keys(role?.fields ?? {}).length
  const hasAdditional = !!Object.keys(role?.additional_fields ?? {}).length
  return hasFields || hasAdditional
}
