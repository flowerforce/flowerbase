import { Document, WithId } from "mongodb";
import { User } from "../../../auth/dtos";
import { Role } from "../interface";
import { LogMachineInfoParams } from "./interface";
/**
 * Determines the first applicable role for a given user and document.
 *
 * @param {WithId<Document> | null} document - The document to check against role conditions.
 * @param {User} user - The user for whom the role is being determined.
 * @param {Role[]} [roles=[]] - The list of available roles to evaluate.
 *
 * @returns {Role | null} - Returns the first role that matches the `apply_when` condition, or `null` if none match.
 */
export declare const getWinningRole: (document: WithId<Document> | null, user: User, roles?: Role[]) => Role | null;
/**
 * Checks if the `apply_when` condition is valid for the given user and document.
 *
 * @param {Role["apply_when"]} apply_when - The rule condition to evaluate.
 * @param {User} user - The user for whom the condition is being checked.
 * @param {WithId<Document> | null} document - The document to check against the condition.
 *
 * @returns {boolean} - Returns `true` if at least one valid rule is found, otherwise `false`.
 */
export declare const checkApplyWhen: (apply_when: Role["apply_when"], user: User, document: WithId<Document> | null) => boolean;
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
export declare const logMachineInfo: ({ enabled, machine, step, stepName }: LogMachineInfoParams) => void;
//# sourceMappingURL=utils.d.ts.map