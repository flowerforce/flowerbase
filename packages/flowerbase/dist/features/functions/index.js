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
exports.registerFunctions = void 0;
const constants_1 = require("../../constants");
const controller_1 = require("./controller");
/**
 * > Registers the functions controller
 * @param app -> the fastify instance
 * @param functionsList -> the list of all functions
 * @param rulesList -> the list of all rules
 */
const registerFunctions = (_a) => __awaiter(void 0, [_a], void 0, function* ({ app, rulesList, functionsList }) {
    yield app.register(controller_1.functionsController, {
        functionsList,
        rules: rulesList,
        prefix: `${constants_1.API_VERSION}/app/:appId/functions`
    });
});
exports.registerFunctions = registerFunctions;
