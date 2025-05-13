import { Document, OptionalId } from 'mongodb'
import { User } from '../../../auth/dtos'
import { Filter } from '../../../features/rules/interface'
import { getValidRule } from '../../../services/mongodb-atlas/utils'
import { Role } from '../interface'
import { LogMachineInfoParams } from './interface'

/**
 * Determines the first applicable role for a given user and document.
 *
 * @param {OptionalId<Document> | null} document - The document to check against role conditions.
 * @param {User} user - The user for whom the role is being determined.
 * @param {Role[]} [roles=[]] - The list of available roles to evaluate.
 *
 * @returns {Role | null} - Returns the first role that matches the `apply_when` condition, or `null` if none match.
 */
export const getWinningRole = (
  document: OptionalId<Document> | null,
  user: User,
  roles: Role[] = []
): Role | null => {
  if (!roles.length) return null
  for (const role of roles) {
    if (checkApplyWhen(role.apply_when, user, document)) {
      return role
    }
  }
  return null
}

/**
 * Checks if the `apply_when` condition is valid for the given user and document.
 *
 * @param {Role["apply_when"]} apply_when - The rule condition to evaluate.
 * @param {User} user - The user for whom the condition is being checked.
 * @param {WithId<Document> | null} document - The document to check against the condition.
 *
 * @returns {boolean} - Returns `true` if at least one valid rule is found, otherwise `false`.
 */
export const checkApplyWhen = (
  apply_when: Role['apply_when'],
  user: User,
  document: OptionalId<Document> | null
) => {
  const validRule = getValidRule({
    filters: [{ apply_when } as Filter],
    user,
    record: document
  })
  return !!validRule.length
}

/**
 * Logs machine step information if logging is enabled.
 *
 * @param {Object} params - The parameters for logging machine info.
 * @param {boolean} params.enabled - Whether logging is enabled.
 * @param {string} params.machine - The name of the machine.
 * @param {number} params.step - The current step number.
 * @param {string} params.stepName - The name of the current step.
 *
 * @returns {void}
 */
export const logMachineInfo = ({
  enabled,
  machine,
  step,
  stepName
}: LogMachineInfoParams) => {
  if (enabled) console.log(`MACHINE ${machine} -> STEP ${step}: ${stepName}`)
}
