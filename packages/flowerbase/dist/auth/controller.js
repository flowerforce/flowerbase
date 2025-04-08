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
exports.authController = authController;
const bson_1 = require("bson");
const constants_1 = require("../constants");
const utils_1 = require("./utils");
const HANDLER_TYPE = 'preHandler';
/**
 * Controller for handling user authentication, profile retrieval, and session management.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
function authController(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const { authCollection, userCollection } = constants_1.AUTH_CONFIG;
        const db = app.mongo.client.db(constants_1.DB_NAME);
        app.addHook(HANDLER_TYPE, app.jwtAuthentication);
        /**
         * Endpoint to retrieve the authenticated user's profile.
         *
         * @route {GET} /profile
         * @param {import('fastify').FastifyRequest} req - The request object.
         * @returns {Promise<Object>} A promise resolving with the user's profile data.
         */
        app.get(utils_1.AUTH_ENDPOINTS.PROFILE, function (req) {
            return __awaiter(this, void 0, void 0, function* () {
                const user = yield db
                    .collection(authCollection)
                    .findOne({ _id: bson_1.ObjectId.createFromHexString(req.user.id) });
                return {
                    _id: user === null || user === void 0 ? void 0 : user._id.toString(),
                    identities: user === null || user === void 0 ? void 0 : user.identities,
                    type: 'normal',
                    custom_data: user === null || user === void 0 ? void 0 : user.curstom_data,
                    data: {
                        _id: user === null || user === void 0 ? void 0 : user._id.toString(),
                        email: user === null || user === void 0 ? void 0 : user.email
                    }
                };
            });
        });
        /**
         * Endpoint to create a new session and generate a new access token.
         *
         * @route {POST} /session
         * @param {import('fastify').FastifyRequest} req - The request object containing the refresh token.
         * @param {import('fastify').FastifyReply} res - The response object.
         * @returns {Promise<SessionCreatedDto>} A promise resolving with the newly created session data.
         */
        app.post(utils_1.AUTH_ENDPOINTS.SESSION, function (req, res) {
            return __awaiter(this, void 0, void 0, function* () {
                if (req.user.typ !== 'refresh') {
                    throw new Error(utils_1.AUTH_ERRORS.INVALID_TOKEN);
                }
                const auth_user = yield (db === null || db === void 0 ? void 0 : db.collection(authCollection).findOne({ _id: new this.mongo.ObjectId(req.user.sub) }));
                if (!auth_user) {
                    throw new Error(`User with ID ${req.user.sub} not found`);
                }
                const user = yield db.collection(userCollection).findOne({ [constants_1.AUTH_CONFIG.user_id_field]: req.user.sub });
                res.status(201);
                return {
                    access_token: this.createAccessToken(Object.assign(Object.assign({}, auth_user), { user_data: user }))
                };
            });
        });
    });
}
