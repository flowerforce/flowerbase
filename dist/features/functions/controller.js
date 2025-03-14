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
exports.functionsController = void 0;
const bson_1 = require("bson");
const services_1 = require("../../services");
const context_1 = require("../../utils/context");
const utils_1 = require("./utils");
/**
 * > Creates a pre handler for every query
 * @param app -> the fastify instance
 * @param functionsList -> the list of all functions
 * @param rules -> all the rules
 */
const functionsController = (app_1, _a) => __awaiter(void 0, [app_1, _a], void 0, function* (app, { functionsList, rules }) {
    app.addHook('preHandler', app.jwtAuthentication);
    app.post('/call', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const { user } = req;
        const { name: method, arguments: args } = req.body;
        if ('service' in req.body) {
            const serviceFn = services_1.services[req.body.service];
            if (!serviceFn) {
                throw new Error(`Service "${req.body.service}" does not exist`);
            }
            const [{ database, collection, query, update, document }] = args;
            const currentMethod = serviceFn(app, { rules, user })
                .db(database)
                .collection(collection)[method];
            const operatorsByType = yield (0, utils_1.executeQuery)({
                currentMethod,
                query,
                update,
                document
            });
            return operatorsByType[method]();
        }
        const currentFunction = functionsList[method];
        if (!currentFunction) {
            throw new Error(`Function "${req.body.name}" does not exist`);
        }
        if (currentFunction.private) {
            throw new Error(`Function "${req.body.name}" is private`);
        }
        const result = yield (0, context_1.GenerateContext)({
            args: req.body.arguments,
            app,
            rules,
            user: Object.assign(Object.assign({}, user), { _id: new bson_1.ObjectId(user.id) }),
            currentFunction: currentFunction,
            functionsList,
            services: services_1.services
        });
        res.type("application/json");
        return JSON.stringify(result);
    }));
});
exports.functionsController = functionsController;
