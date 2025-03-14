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
exports.STEP_D_STATES = void 0;
const utils_1 = require("../../utils");
const validators_1 = require("./validators");
exports.STEP_D_STATES = {
    checkAdditionalFields: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, next, endValidation }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "D", step: 1, stepName: "checkAdditionalFields" });
        const check = (0, validators_1.checkAdditionalFieldsFn)(context);
        return check ? next('evaluateRead') : endValidation({ success: false });
    }),
    checkIsValidFieldName: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, endValidation }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "D", step: 2, stepName: "checkIsValidFieldName" });
        const document = (0, validators_1.checkIsValidFieldNameFn)(context);
        return endValidation({ success: !!Object.keys(document).length, document });
    }),
};
