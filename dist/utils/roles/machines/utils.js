"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logMachineInfo = exports.checkApplyWhen = exports.getWinningRole = void 0;
const utils_1 = require("../../../services/mongodb-atlas/utils");
/**
 * Determines the first applicable role for a given user and document.
 *
 * @param {WithId<Document> | null} document - The document to check against role conditions.
 * @param {User} user - The user for whom the role is being determined.
 * @param {Role[]} [roles=[]] - The list of available roles to evaluate.
 *
 * @returns {Role | null} - Returns the first role that matches the `apply_when` condition, or `null` if none match.
 */
const getWinningRole = (document, user, roles = []) => {
    if (!roles.length)
        return null;
    for (const role of roles) {
        if ((0, exports.checkApplyWhen)(role.apply_when, user, document)) {
            return role;
        }
    }
    return null;
};
exports.getWinningRole = getWinningRole;
/**
 * Checks if the `apply_when` condition is valid for the given user and document.
 *
 * @param {Role["apply_when"]} apply_when - The rule condition to evaluate.
 * @param {User} user - The user for whom the condition is being checked.
 * @param {WithId<Document> | null} document - The document to check against the condition.
 *
 * @returns {boolean} - Returns `true` if at least one valid rule is found, otherwise `false`.
 */
const checkApplyWhen = (apply_when, user, document) => {
    const validRule = (0, utils_1.getValidRule)({ filters: [{ apply_when }], user, record: document });
    return !!validRule.length;
};
exports.checkApplyWhen = checkApplyWhen;
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
const logMachineInfo = ({ enabled, machine, step, stepName }) => {
    if (enabled)
        console.log(`MACHINE ${machine} -> STEP ${step}: ${stepName}`);
};
exports.logMachineInfo = logMachineInfo;
