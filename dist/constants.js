"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AUTH_CONFIG = exports.DB_NAME = exports.HTTPS_SCHEMA = exports.API_VERSION = exports.DEFAULT_CONFIG = void 0;
const utils_1 = require("./auth/utils");
const { database_name, collection_name = 'users' } = (0, utils_1.loadCustomUserData)();
const _a = (0, utils_1.loadAuthConfig)(), { auth_collection = 'auth_users' } = _a, configuration = __rest(_a, ["auth_collection"]);
exports.DEFAULT_CONFIG = {
    PORT: Number(process.env.PORT) || 3000,
    MONGODB_URL: process.env.MONGODB_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || ''
};
exports.API_VERSION = `/api/client/${process.env.API_VERSION}`;
exports.HTTPS_SCHEMA = process.env.HTTPS_SCHEMA || 'https';
exports.DB_NAME = database_name;
exports.AUTH_CONFIG = {
    authCollection: auth_collection,
    userCollection: collection_name,
    resetPasswordCollection: "reset-password-requests",
    resetPasswordConfig: configuration['local-userpass'].config
};
