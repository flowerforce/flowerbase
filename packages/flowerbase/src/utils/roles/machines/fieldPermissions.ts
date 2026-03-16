import { Document } from 'mongodb'
import { evaluateExpression } from '../helpers'
import {
  AdditionalFieldsPermissionExpression,
  FieldPermissionExpression,
  Role
} from '../interface'
import { MachineContext } from './interface'

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const isFieldPermissionExpression = (value: unknown): value is FieldPermissionExpression =>
  isObject(value) && ('read' in value || 'write' in value)

const getAdditionalFieldPermission = (
  additionalFields: AdditionalFieldsPermissionExpression | undefined,
  fieldName: string
): FieldPermissionExpression | undefined => {
  if (!additionalFields || !isObject(additionalFields)) return undefined

  const byField = (additionalFields as Record<string, unknown>)[fieldName]
  if (isFieldPermissionExpression(byField)) {
    return byField
  }

  if (isFieldPermissionExpression(additionalFields)) {
    return additionalFields
  }

  return undefined
}

const canReadField = async (
  context: Pick<MachineContext, 'params' | 'user'>,
  permission?: FieldPermissionExpression
) => {
  if (!permission || typeof permission.read === 'undefined') return undefined
  return await evaluateExpression(context.params, permission.read, context.user)
}

const canWriteField = async (
  context: Pick<MachineContext, 'params' | 'user'>,
  permission?: FieldPermissionExpression
) => {
  if (!permission) return false
  return await evaluateExpression(context.params, permission.write, context.user)
}

export const hasAdditionalFieldsDefined = (role?: Role) =>
  typeof role?.additional_fields !== 'undefined'

export const filterDocumentByFieldPermissions = async (
  context: Pick<MachineContext, 'params' | 'role' | 'user'>,
  mode: 'read' | 'write',
  options?: {
    defaultAllow?: boolean
  }
): Promise<Document> => {
  const source = context.params?.cursor
  if (!isObject(source)) return {}

  const document: Document = {}
  const fields = context.role.fields ?? {}
  const additionalFields = context.role.additional_fields

  for (const [key, value] of Object.entries(source)) {
    if (mode === 'read' && key === '_id') {
      document[key] = value
      continue
    }

    const fieldPermission = fields[key]
    const permission = fieldPermission ?? getAdditionalFieldPermission(additionalFields, key)
    let allowed = options?.defaultAllow === true
    if (permission) {
      if (mode === 'read') {
        const readAllowed = await canReadField(context, permission)
        if (typeof readAllowed !== 'undefined') {
          allowed = readAllowed
        }
      } else {
        allowed = await canWriteField(context, permission)
      }
    }

    if (allowed) {
      document[key] = value
    }
  }

  return document
}
