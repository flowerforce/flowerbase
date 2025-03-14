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
exports.makeRequest = void 0;
const undici_1 = require("undici");
/**
 * > Creates the http request
 * @param method -> the HTTP METHOD
 * @param url -> url string
 * @param headers -> request headers
 * @param body -> request body
 */
const makeRequest = (_a) => __awaiter(void 0, [_a], void 0, function* ({ method, url, headers, body }) {
    try {
        const response = yield (0, undici_1.request)(url, {
            method,
            headers,
            body
        });
        return response;
    }
    catch (error) {
        return _handleError(error);
    }
});
exports.makeRequest = makeRequest;
/**
 * > Formats the request error
 * @param error -> the request error
 */
const _handleError = (error) => __awaiter(void 0, void 0, void 0, function* () {
    return {
        status: error.statusCode || 500,
        headers: error.headers || {},
        body: { message: error.message }
    };
});
