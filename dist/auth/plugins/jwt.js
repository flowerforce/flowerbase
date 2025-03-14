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
const jwt_1 = __importDefault(require("@fastify/jwt"));
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const mongodb_1 = require("mongodb");
/**
 * This module is a Fastify plugin that sets up JWT-based authentication and token creation.
 * It registers JWT authentication, and provides methods to create access and refresh tokens.
 * @testable
 * @param {import('fastify').FastifyInstance} fastify - The Fastify instance.
 * @param {Object} opts - Options for the plugin.
 * @param {string} opts.secret - The secret key used for signing JWTs.
 */
exports.default = (0, fastify_plugin_1.default)(function (fastify, opts) {
    return __awaiter(this, void 0, void 0, function* () {
        const BAAS_ID = new mongodb_1.ObjectId().toString();
        fastify.register(jwt_1.default, {
            secret: opts.secret
        });
        fastify.decorate('jwtAuthentication', function (request, reply) {
            return __awaiter(this, void 0, void 0, function* () {
                try {
                    yield request.jwtVerify();
                }
                catch (err) {
                    // TODO: handle error
                    reply.send(err);
                }
            });
        });
        fastify.decorate('createAccessToken', function (user) {
            const id = user._id.toString();
            const user_data = Object.assign({ _id: id, id }, user.user_data);
            return this.jwt.sign({
                typ: 'access',
                id,
                user_data: user_data,
                custom_data: user_data
            }, {
                iss: BAAS_ID,
                jti: BAAS_ID,
                sub: user._id.toJSON(),
                expiresIn: '300m'
            });
        });
        fastify.decorate('createRefreshToken', function (user) {
            return this.jwt.sign({
                typ: 'refresh',
                baas_id: BAAS_ID
            }, {
                sub: user._id.toJSON(),
                expiresIn: '60d'
            });
        });
    });
});
