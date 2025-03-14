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
exports.localUserPassController = localUserPassController;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const constants_1 = require("../../../constants");
const state_1 = require("../../../state");
const context_1 = require("../../../utils/context");
const crypto_1 = require("../../../utils/crypto");
const utils_1 = require("../../utils");
/**
 * Controller for handling local user registration and login.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
function localUserPassController(app) {
    return __awaiter(this, void 0, void 0, function* () {
        const { authCollection } = constants_1.AUTH_CONFIG;
        const db = app.mongo.client.db(constants_1.DB_NAME);
        /**
         * Endpoint for user registration.
         *
         * @route {POST} /register
         * @param {RegistrationDto} req - The request object with registration data.
         * @param {FastifyReply} res - The response object.
         * @returns {Promise<Object>} A promise resolving with the newly created user's ID.
         */
        app.post(utils_1.AUTH_ENDPOINTS.REGISTRATION, {
            schema: utils_1.REGISTRATION_SCHEMA
        }, function (req, res) {
            return __awaiter(this, void 0, void 0, function* () {
                const { email, password } = req.body;
                const hashedPassword = yield (0, crypto_1.hashPassword)(password);
                const result = yield db.collection(authCollection).insertOne({
                    email: email,
                    password: hashedPassword,
                    custom_data: {
                    // todo li faremo arrivare
                    }
                });
                yield (db === null || db === void 0 ? void 0 : db.collection(authCollection).updateOne({
                    email: email
                }, {
                    $set: {
                        identities: [
                            {
                                id: result === null || result === void 0 ? void 0 : result.insertedId.toString(),
                                provider_id: result === null || result === void 0 ? void 0 : result.insertedId.toString(),
                                provider_type: utils_1.PROVIDER_TYPE,
                                provider_data: { email }
                            }
                        ]
                    }
                }));
                res.status(201);
                return {
                    userId: result === null || result === void 0 ? void 0 : result.insertedId
                };
            });
        });
        /**
         * Endpoint for user login.
         *
         * @route {POST} /login
         * @param {LoginDto} req - The request object with login data.
         * @returns {Promise<Object>} A promise resolving with access and refresh tokens.
         */
        app.post(utils_1.AUTH_ENDPOINTS.LOGIN, {
            schema: utils_1.LOGIN_SCHEMA
        }, function (req) {
            return __awaiter(this, void 0, void 0, function* () {
                const storedUser = yield db.collection(authCollection).findOne({
                    email: req.body.username
                });
                if (!storedUser) {
                    throw new Error(utils_1.AUTH_ERRORS.INVALID_CREDENTIALS);
                }
                const passwordMatches = yield (0, crypto_1.comparePassword)(req.body.password, storedUser.password);
                if (!passwordMatches) {
                    throw new Error(utils_1.AUTH_ERRORS.INVALID_CREDENTIALS);
                }
                return {
                    access_token: this.createAccessToken(storedUser),
                    refresh_token: this.createRefreshToken(storedUser),
                    device_id: '',
                    user_id: storedUser._id.toString()
                };
            });
        });
        /**
       * Endpoint for reset password.
       *
       * @route {POST} /reset/call
       * @param {ResetPasswordDto} req - The request object with th reset request.
       * @returns {Promise<void>}
       */
        app.post(utils_1.AUTH_ENDPOINTS.RESET, {
            schema: utils_1.RESET_SCHEMA
        }, function (req) {
            return __awaiter(this, void 0, void 0, function* () {
                const { resetPasswordCollection, resetPasswordConfig } = constants_1.AUTH_CONFIG;
                const email = req.body.email;
                const storedUser = yield db.collection(authCollection).findOne({
                    email
                });
                if (!storedUser) {
                    throw new Error(utils_1.AUTH_ERRORS.INVALID_CREDENTIALS);
                }
                const token = (0, crypto_1.generateToken)();
                const tokenId = (0, crypto_1.generateToken)();
                yield (db === null || db === void 0 ? void 0 : db.collection(resetPasswordCollection).updateOne({ email }, { $set: { token, tokenId, email, createdAt: new Date() } }, { upsert: true }));
                if (resetPasswordConfig.runResetFunction && resetPasswordConfig.resetFunctionName) {
                    const functionsList = state_1.StateManager.select("functions");
                    const services = state_1.StateManager.select("services");
                    const currentFunction = functionsList[resetPasswordConfig.resetFunctionName];
                    yield (0, context_1.GenerateContext)({
                        args: [{ token, tokenId, email }],
                        app,
                        rules: {},
                        user: {},
                        currentFunction,
                        functionsList,
                        services
                    });
                    return;
                }
                const { from, subject, mailToken, body } = (0, utils_1.getMailConfig)(resetPasswordConfig, token, tokenId);
                mail_1.default.setApiKey(mailToken);
                yield mail_1.default.send({
                    to: email,
                    from,
                    subject,
                    html: body
                });
            });
        });
        /**
      * Endpoint for confirm reset password.
      *
      * @route {POST} /reset
      * @param {ConfirmResetPasswordDto} req - The request object with reset data.
      * @returns {Promise<void>}
      */
        app.post(utils_1.AUTH_ENDPOINTS.CONFIRM_RESET, {
            schema: utils_1.CONFIRM_RESET_SCHEMA
        }, function (req) {
            return __awaiter(this, void 0, void 0, function* () {
                const { resetPasswordCollection } = constants_1.AUTH_CONFIG;
                const { token, tokenId, password } = req.body;
                const resetRequest = yield (db === null || db === void 0 ? void 0 : db.collection(resetPasswordCollection).findOne({ token, tokenId }));
                if (!resetRequest) {
                    throw new Error(utils_1.AUTH_ERRORS.INVALID_RESET_PARAMS);
                }
                const hashedPassword = yield (0, crypto_1.hashPassword)(password);
                yield db.collection(authCollection).updateOne({ email: resetRequest.email, }, {
                    $set: {
                        password: hashedPassword
                    }
                });
                yield (db === null || db === void 0 ? void 0 : db.collection(resetPasswordCollection).deleteOne({ _id: resetRequest._id }));
            });
        });
    });
}
