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
exports.initialize = initialize;
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const constants_1 = require("./constants");
const endpoints_1 = require("./features/endpoints");
const utils_1 = require("./features/endpoints/utils");
const functions_1 = require("./features/functions");
const utils_2 = require("./features/functions/utils");
const utils_3 = require("./features/rules/utils");
const triggers_1 = require("./features/triggers");
const utils_4 = require("./features/triggers/utils");
const services_1 = require("./services");
const state_1 = require("./state");
const exposeRoutes_1 = require("./utils/initializer/exposeRoutes");
const registerPlugins_1 = require("./utils/initializer/registerPlugins");
/**
 * > Used to initialize fastify app
 * @param projectId -> the project id string
 * @param host -> the host string
 * @param jwtSecret -> connection jwt
 * @param port -> the serve port number
 * @param mongodbUrl -> the database connection string
 */
function initialize(_a) {
    return __awaiter(this, arguments, void 0, function* ({ projectId, host, jwtSecret = constants_1.DEFAULT_CONFIG.JWT_SECRET, port = constants_1.DEFAULT_CONFIG.PORT, mongodbUrl = constants_1.DEFAULT_CONFIG.MONGODB_URL }) {
        const fastify = (0, fastify_1.default)({
            logger: false
        });
        const functionsList = yield (0, utils_2.loadFunctions)();
        const triggersList = yield (0, utils_4.loadTriggers)();
        const endpointsList = yield (0, utils_1.loadEndpoints)();
        const rulesList = yield (0, utils_3.loadRules)();
        const stateConfig = {
            functions: functionsList,
            triggers: triggersList,
            endpoints: endpointsList,
            rules: rulesList,
            app: fastify,
            services: services_1.services
        };
        Object.entries(stateConfig).forEach(([key, value]) => state_1.StateManager.setData(key, value));
        yield (0, registerPlugins_1.registerPlugins)({
            register: fastify.register,
            mongodbUrl,
            jwtSecret,
            functionsList
        });
        yield (0, exposeRoutes_1.exposeRoutes)(fastify);
        yield (0, functions_1.registerFunctions)({ app: fastify, functionsList, rulesList });
        yield (0, endpoints_1.generateEndpoints)({ app: fastify, functionsList, endpointsList });
        fastify.ready(() => (0, triggers_1.activateTriggers)({ fastify, triggersList, functionsList }));
        yield fastify.listen({ port, host });
        fastify.log.info(`[${projectId}] Server listening on port ${port}`);
    });
}
