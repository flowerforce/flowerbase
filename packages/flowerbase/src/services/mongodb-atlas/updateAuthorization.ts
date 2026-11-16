import { User } from '../../auth/dtos'
import { evaluateExpression } from '../../utils/roles/helpers'
import { PermissionExpression, Role } from '../../utils/roles/interface'

// Only evaluate predicates whose outcome cannot depend on a stored document or
// execute a server function. Unknown predicates remain possible permissions.
const isUserPredicate = (expression: unknown): expression is PermissionExpression => {
  if (typeof expression === 'boolean') return true
  if (!expression || typeof expression !== 'object' || Array.isArray(expression))
    return false
  return Object.entries(expression).every(([key, value]) => {
    if (['$and', '%and', '$or', '%or'].includes(key))
      return Array.isArray(value) && value.every(isUserPredicate)
    if (
      !(
        key === '%%user' ||
        key.startsWith('%%user.') ||
        key === '%%true' ||
        key === '%%false'
      )
    )
      return false
    const safeOperand = (operand: unknown): boolean => {
      if (typeof operand === 'string')
        return (
          !operand.includes('$ref:') &&
          (!operand.includes('%%') ||
            operand.startsWith('%%user.') ||
            operand === '%%true' ||
            operand === '%%false')
        )
      if (Array.isArray(operand)) return operand.every(safeOperand)
      if (operand && typeof operand === 'object')
        return Object.entries(operand).every(
          ([operator, child]) =>
            !['%function', '$function', '$where', '$accumulator'].includes(operator) &&
            safeOperand(child)
        )
      return true
    }
    return safeOperand(value)
  })
}

/** Reject a provably forbidden update before accessing MongoDB. */
export const assertUpdateMayBePermitted = async (roles: Role[], user?: User) => {
  const known = async (expression?: unknown): Promise<boolean | undefined> =>
    expression === undefined
      ? false
      : isUserPredicate(expression)
        ? evaluateExpression(
            { type: 'write', roles, cursor: undefined, expansions: {} },
            expression,
            user
          )
        : undefined

  for (const role of roles) {
    const applies = await known(role.apply_when)
    if (applies === false) continue
    if (role.write !== undefined) {
      if ((await known(role.write)) !== false) return
    } else {
      const permissions = [
        ...Object.values(role.fields ?? {}),
        ...Object.values(role.additional_fields ?? {}),
        role.additional_fields
      ]
      for (const permission of permissions) {
        if (
          permission &&
          typeof permission === 'object' &&
          'write' in permission &&
          (await known(permission.write)) !== false
        )
          return
      }
    }
    if (applies === true) break // No later role can win.
  }
  throw new Error('Update not permitted')
}
