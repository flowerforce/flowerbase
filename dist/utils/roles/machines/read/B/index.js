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
const utils_1 = require("../../utils");
const validators_1 = require("./validators");
exports.STEP_B_STATES = {
    checkDocumentsFilters: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, next, goToNextValidationStage }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 1, stepName: "checkDocumentsFilters" });
        const { role } = context;
        if (role.document_filters) {
            return next('evaluateDocumentsFiltersRead');
        }
        return goToNextValidationStage();
    }),
    evaluateDocumentsFiltersRead: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, next, goToNextValidationStage }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 2, stepName: "evaluateDocumentsFiltersRead" });
        const hasDocumentFiltersRead = yield (0, validators_1.evaluateDocumentFiltersReadFn)(context);
        if (!hasDocumentFiltersRead)
            return next('evaluateDocumentsFiltersWrite');
        return goToNextValidationStage();
    }),
    evaluateDocumentsFiltersWrite: (_a) => __awaiter(void 0, [_a], void 0, function* ({ context, endValidation, goToNextValidationStage }) {
        (0, utils_1.logMachineInfo)({ enabled: context.enableLog, machine: "B", step: 3, stepName: "evaluateDocumentsFiltersWrite" });
        const check = yield (0, validators_1.evaluateDocumentFiltersWriteFn)(context);
        return check ? goToNextValidationStage() : endValidation({ success: false });
    })
};
