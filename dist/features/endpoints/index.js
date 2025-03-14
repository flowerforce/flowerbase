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
exports.generateEndpoints = void 0;
const utils_1 = require("./utils");
/**
 * > Generates all HTTP endpoints
 * @testable
 * @param app -> the fastify instance
 * @param functionsList -> the list of all functions
 * @param endpointsList -> the list of all endpoints
 */
const generateEndpoints = (_a) => __awaiter(void 0, [_a], void 0, function* ({ app, functionsList, endpointsList }) {
    endpointsList.forEach(({ http_method, route, disabled, function_name }) => {
        const currentFunction = functionsList[function_name];
        if (disabled || !currentFunction)
            return;
        const handler = (0, utils_1.generateHandler)({ app, currentFunction, functionsList });
        const currentMethod = (0, utils_1.getMethodsConfig)(app, handler, `/app/:appId/endpoint/${route}`)[http_method];
        currentMethod();
    });
});
exports.generateEndpoints = generateEndpoints;
