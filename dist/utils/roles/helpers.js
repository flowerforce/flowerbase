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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateExpression = void 0;
const services_1 = require("../../services");
const state_1 = require("../../state");
const context_1 = require("../context");
const rules_1 = require("../rules");
const utils_1 = __importDefault(require("../rules-matcher/utils"));
const functionsConditions = ["%%true", "%%false"];
const evaluateExpression = (params, expression, user) => __awaiter(void 0, void 0, void 0, function* () {
    if (!expression || typeof expression === 'boolean')
        return !!expression;
    const value = Object.assign(Object.assign({}, params.expansions), { '%%true': true });
    const conditions = (0, rules_1.expandQuery)(expression, value);
    const complexCondition = Object.entries(conditions).find(([key]) => functionsConditions.includes(key));
    return complexCondition ? yield evaluateComplexExpression(complexCondition, params, user) : utils_1.default.checkRule(conditions, value, {});
});
exports.evaluateExpression = evaluateExpression;
const evaluateComplexExpression = (condition, params, user) => __awaiter(void 0, void 0, void 0, function* () {
    const [key, config] = condition;
    const { name } = config["%function"];
    const functionsList = state_1.StateManager.select("functions");
    const app = state_1.StateManager.select("app");
    const currentFunction = functionsList[name];
    const response = yield (0, context_1.GenerateContext)({
        args: [params.cursor],
        app,
        rules: {},
        user,
        currentFunction,
        functionsList,
        services: services_1.services
    });
    return key === "%%true" ? response : !response;
});
