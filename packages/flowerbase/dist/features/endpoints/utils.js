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
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHandler = exports.getMethodsConfig = exports.loadEndpoints = void 0;
const fs_1 = __importDefault(require("fs"));
const services_1 = require("../../services");
const context_1 = require("../../utils/context");
/**
 * > Loads the endpoint config json file
 * @testable
 */
const loadEndpoints = () => __awaiter(void 0, void 0, void 0, function* () {
    const config = JSON.parse(fs_1.default.readFileSync('http_endpoints/config.json', 'utf-8'));
    return config.map((_a) => {
        var { http_method } = _a, endpoint = __rest(_a, ["http_method"]);
        return (Object.assign({ http_method: http_method === '*' ? 'ALL' : http_method }, endpoint));
    });
});
exports.loadEndpoints = loadEndpoints;
/**
 * > Creates an object with a config for all HTTP methods
 * @testable
 * @param app -> the fastify instance
 * @param handler -> the handler function for that route
 * @param endpoint -> the current endpoint
 */
const getMethodsConfig = (app, handler, endpoint) => ({
    ALL: () => app.all(endpoint, handler),
    GET: () => app.get(endpoint, handler),
    POST: () => app.post(endpoint, handler),
    PUT: () => app.put(endpoint, handler),
    PATCH: () => app.patch(endpoint, handler),
    DELETE: () => app.delete(endpoint, handler)
});
exports.getMethodsConfig = getMethodsConfig;
/**
 * > Creates an handler function for a single endpoint
 * @testable
 * @param app -> the fastify instance
 * @param currentFunction -> the name of the function that should be called for that endpoint
 * @param functionsList -> the list of all functions
 */
const generateHandler = ({ app, currentFunction, functionsList }) => {
    return (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const response = yield (0, context_1.GenerateContext)({
                args: [req],
                app,
                rules: {}, //TODO -> check rules
                user: req.user,
                currentFunction,
                functionsList,
                services: services_1.services
            });
            res.send(response);
        }
        catch (e) {
            console.log(e);
        }
        return {};
    });
};
exports.generateHandler = generateHandler;
