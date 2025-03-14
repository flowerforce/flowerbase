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
exports.GenerateContext = GenerateContext;
const module_1 = __importDefault(require("module"));
const vm_1 = __importDefault(require("vm"));
const bson_1 = require("bson");
const helpers_1 = require("./helpers");
/**
 * > Used to generate the current context
 * @testable
 * @param args -> generic arguments
 * @param app -> the fastify instance
 * @param rules -> the rules object
 * @param user -> the current user
 * @param currentFunction -> the function's name that should be called
 * @param functionsList -> the list of all functions
 * @param services -> the list of all services
 */
function GenerateContext(_a) {
    return __awaiter(this, arguments, void 0, function* ({ args, app, rules, user, currentFunction, functionsList, services }) {
        const contextData = (0, helpers_1.generateContextData)({
            user,
            services,
            app,
            rules,
            currentFunction,
            functionsList,
            GenerateContext
        });
        vm_1.default.runInContext(module_1.default.wrap(currentFunction.code), vm_1.default.createContext(contextData))(exports, require, module, __filename, __dirname);
        return yield module.exports(...bson_1.EJSON.deserialize(args));
    });
}
