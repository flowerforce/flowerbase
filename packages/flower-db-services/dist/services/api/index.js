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
const constants_1 = require("../../constants");
const utils_1 = require("./utils");
/**
 * > This service is the Api Client that can be imported from the context
 */
const Api = () => ({
    get: (_a) => __awaiter(void 0, [_a], void 0, function* ({ url, headers = {} }) {
        return (0, utils_1.makeRequest)({ method: 'GET', url, headers });
    }),
    post: (_a) => __awaiter(void 0, [_a], void 0, function* ({ scheme = constants_1.HTTPS_SCHEMA, host, path, url: currentUrl, headers = {}, body, encodeBodyAsJSON = false }) {
        const formattedBody = encodeBodyAsJSON ? JSON.stringify(body) : body;
        const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`;
        return (0, utils_1.makeRequest)({ method: 'POST', url, headers: Object.assign({ "Content-Type": "application/json" }, headers), body: formattedBody });
    }),
    put: (_a) => __awaiter(void 0, [_a], void 0, function* ({ scheme = constants_1.HTTPS_SCHEMA, host, path, url: currentUrl, headers = {}, body, encodeBodyAsJSON = false }) {
        const formattedBody = encodeBodyAsJSON ? JSON.stringify(body) : body;
        const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`;
        return (0, utils_1.makeRequest)({ method: 'PUT', url, headers, body: formattedBody });
    }),
    delete: (_a) => __awaiter(void 0, [_a], void 0, function* ({ scheme = constants_1.HTTPS_SCHEMA, host, path, url: currentUrl, headers = {} }) {
        const url = currentUrl ? currentUrl : `${scheme}://${host}/${path}`;
        return (0, utils_1.makeRequest)({ method: 'DELETE', url, headers });
    })
});
exports.default = Api;
