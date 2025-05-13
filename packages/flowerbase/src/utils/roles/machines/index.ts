import { User } from '../../../auth/dtos'
import { Params, Role } from '../interface'
import { StepResult } from './interface'
import { StateMachine } from './machine'

/**
 * Executes the validation process using the `StateMachine` for the given role, parameters, and user.
 *
 * @param {Role} role - The role configuration for validation.
 * @param {Params} params - The parameters relevant to the validation process.
 * @param {User} user - The user for whom the validation is being performed.
 *
 * @returns {Promise<StepResult>} - The result of the state machine's validation process.
 */
export const checkValidation = async (
  role: Role,
  params: Params,
  user: User,
  enableLog?: boolean
): Promise<StepResult> => {
  const stateMachine = new StateMachine(role, params, user, enableLog)
  return await stateMachine.runValidation()
}
