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
exports.registerPlugins = void 0;
const cors_1 = __importDefault(require("@fastify/cors"));
const mongodb_1 = __importDefault(require("@fastify/mongodb"));
const controller_1 = require("../../auth/controller");
const jwt_1 = __importDefault(require("../../auth/plugins/jwt"));
const controller_2 = require("../../auth/providers/local-userpass/controller");
const constants_1 = require("../../constants");
/**
 * > Used to register all plugins
 * @param register -> the fastify register method
 * @param mongodbUrl -> the database connection string
 * @param jwtSecret -> connection jwt
 * @tested
 */
const registerPlugins = (_a) => __awaiter(void 0, [_a], void 0, function* ({ register, mongodbUrl, jwtSecret, functionsList }) {
    try {
        const registersConfig = yield getRegisterConfig({
            mongodbUrl,
            jwtSecret,
            functionsList
        });
        registersConfig.forEach(({ plugin, options }) => {
            register(plugin, options);
        });
    }
    catch (e) {
        console.error('Error while registering plugins', e.message);
    }
});
exports.registerPlugins = registerPlugins;
/**
 * > Used to generate the register congig
 * @param mongodbUrl -> the database connection string
 * @param jwtSecret -> connection jwt
 * @testable
 */
const getRegisterConfig = (_a) => __awaiter(void 0, [_a], void 0, function* ({ mongodbUrl, jwtSecret }) {
    return [
        {
            plugin: cors_1.default,
            options: {
                origin: '*',
                methods: ['POST', 'GET']
            }
        },
        {
            plugin: mongodb_1.default,
            options: {
                forceClose: true,
                url: mongodbUrl
            }
        },
        {
            plugin: jwt_1.default,
            options: {
                secret: jwtSecret
            }
        },
        {
            plugin: controller_1.authController,
            options: { prefix: `${constants_1.API_VERSION}/auth` }
        },
        {
            plugin: controller_2.localUserPassController,
            options: {
                prefix: `${constants_1.API_VERSION}/app/:appId/auth/providers/local-userpass`
            }
        }
    ];
});
