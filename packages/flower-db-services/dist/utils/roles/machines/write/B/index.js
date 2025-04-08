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
exports.STEP_B_STATES = void 0;
const commonValidators_1 = require("../../commonValidators");
const utils_1 = require("../../utils");
exports.STEP_B_STATES = {
    checkDeleteRequest: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, next }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 1, stepName: "checkDeleteRequest" });
        if (context.params.type === 'delete') {
            return next('evaluateTopLevelDelete');
        }
        return next('evaluateTopLevelWrite');
    }),
    evaluateTopLevelDelete: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, endValidation, }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 2, stepName: "evaluateTopLevelDelete" });
        const check = yield (0, commonValidators_1.evaluateTopLevelPermissionsFn)(context, "delete");
        return endValidation({ success: !!check });
    }),
    evaluateTopLevelWrite: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, next, endValidation }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 3, stepName: "evaluateTopLevelWrite" });
        const check = yield (0, commonValidators_1.evaluateTopLevelPermissionsFn)(context, "write");
        if (check)
            return context.params.type === "insert" ? next('evaluateTopLevelInsert') : endValidation({ success: true });
        return check === false
            ? endValidation({ success: false })
            : next('checkFieldsProperty');
    }),
    checkFieldsProperty: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, goToNextValidationStage }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 4, stepName: "checkFieldsProperty" });
        const check = (0, commonValidators_1.checkFieldsPropertyExists)(context);
        return goToNextValidationStage(check ? 'checkIsValidFieldName' : 'checkAdditionalFields');
    }),
    evaluateTopLevelInsert: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, endValidation }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 5, stepName: "evaluateTopLevelInsert" });
        const check = yield (0, commonValidators_1.evaluateTopLevelPermissionsFn)(context, "insert");
        return endValidation({ success: !!check });
    })
};
