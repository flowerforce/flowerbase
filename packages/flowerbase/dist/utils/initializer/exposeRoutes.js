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
exports.exposeRoutes = void 0;
const node_process_1 = require("node:process");
const constants_1 = require("../../constants");
/**
 * > Used to expose all app routes
 * @param fastify -> the fastify instance
 * @tested
 */
const exposeRoutes = (fastify) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        fastify.get(`${constants_1.API_VERSION}/app/:appId/location`, (req) => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                deployment_model: 'LOCAL',
                location: 'IE',
                hostname: `http://${req.headers.host}`,
                ws_hostname: `wss://${req.headers.host}`
            });
        }));
        fastify.get('/health', () => __awaiter(void 0, void 0, void 0, function* () {
            return ({
                status: 'ok',
                uptime: (0, node_process_1.uptime)()
            });
        }));
    }
    catch (e) {
        console.error('Error while exposing routes', e.message);
    }
});
exports.exposeRoutes = exposeRoutes;
