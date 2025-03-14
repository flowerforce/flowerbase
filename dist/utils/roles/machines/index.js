"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkValidation = void 0;
const machine_1 = require("./machine");
/**
 * Executes the validation process using the `StateMachine` for the given role, parameters, and user.
 *
 * @param {Role} role - The role configuration for validation.
 * @param {Params} params - The parameters relevant to the validation process.
 * @param {User} user - The user for whom the validation is being performed.
 *
 * @returns {Promise<StepResult>} - The result of the state machine's validation process.
 */
const checkValidation = (role, params, user) => __awaiter(void 0, void 0, void 0, function* () {
    const stateMachine = new machine_1.StateMachine(role, params, user);
    return yield stateMachine.runValidation();
});
exports.checkValidation = checkValidation;
