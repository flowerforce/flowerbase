"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMailConfig = exports.loadCustomUserData = exports.loadAuthConfig = exports.PROVIDER_TYPE = exports.AUTH_ERRORS = exports.AUTH_ENDPOINTS = exports.REGISTRATION_SCHEMA = exports.CONFIRM_RESET_SCHEMA = exports.RESET_SCHEMA = exports.LOGIN_SCHEMA = void 0;
const fs_1 = __importDefault(require("fs"));
exports.LOGIN_SCHEMA = {
    body: {
        type: 'object',
        properties: {
            username: { type: 'string' },
            password: { type: 'string' }
        },
        required: ['username', 'password']
    }
};
exports.RESET_SCHEMA = {
    body: {
        type: 'object',
        properties: {
            email: { type: 'string' },
            password: { type: 'string' }
        },
        required: ['email', 'password']
    }
};
exports.CONFIRM_RESET_SCHEMA = {
    body: {
        type: 'object',
        properties: {
            password: { type: 'string' },
            token: { type: 'string' },
            tokenId: { type: 'string' }
        },
        required: ['password', 'token', 'tokenId']
    }
};
exports.REGISTRATION_SCHEMA = {
    body: {
        type: 'object',
        properties: {
            email: { type: 'string' },
            password: { type: 'string' }
        },
        required: ['email', 'password']
    }
};
var AUTH_ENDPOINTS;
(function (AUTH_ENDPOINTS) {
    AUTH_ENDPOINTS["LOGIN"] = "/login";
    AUTH_ENDPOINTS["REGISTRATION"] = "/register";
    AUTH_ENDPOINTS["PROFILE"] = "/profile";
    AUTH_ENDPOINTS["SESSION"] = "/session";
    AUTH_ENDPOINTS["RESET"] = "/reset/call";
    AUTH_ENDPOINTS["CONFIRM_RESET"] = "/reset";
})(AUTH_ENDPOINTS || (exports.AUTH_ENDPOINTS = AUTH_ENDPOINTS = {}));
var AUTH_ERRORS;
(function (AUTH_ERRORS) {
    AUTH_ERRORS["INVALID_CREDENTIALS"] = "Invalid credentials";
    AUTH_ERRORS["INVALID_TOKEN"] = "Invalid refresh token provided";
    AUTH_ERRORS["INVALID_RESET_PARAMS"] = "Invalid token or tokenId provided";
})(AUTH_ERRORS || (exports.AUTH_ERRORS = AUTH_ERRORS = {}));
exports.PROVIDER_TYPE = 'local-userpass';
/**
 * > Loads the auth config json file
 * @testable
 */
const loadAuthConfig = () => {
    return JSON.parse(fs_1.default.readFileSync('auth/providers.json', 'utf-8'));
};
exports.loadAuthConfig = loadAuthConfig;
/**
 * > Loads the custom user data config json file
 * @testable
 */
const loadCustomUserData = () => {
    return JSON.parse(fs_1.default.readFileSync('auth/custom_user_data.json', 'utf-8'));
};
exports.loadCustomUserData = loadCustomUserData;
const getMailConfig = (resetPasswordConfig, token, tokenId) => {
    var _a, _b, _c;
    const { mailConfig, resetPasswordUrl } = resetPasswordConfig;
    const ENV_PREFIX = "ENV";
    const { from, subject, mailToken } = mailConfig;
    const [fromPrefix, fromPath] = from.split(".");
    const currentSender = (_a = (fromPrefix === ENV_PREFIX ? process.env[fromPath] : from)) !== null && _a !== void 0 ? _a : "";
    const [subjectPrefix, subjectPath] = subject.split(".");
    const currentSubject = (_b = (subjectPrefix === ENV_PREFIX ? process.env[subjectPath] : subject)) !== null && _b !== void 0 ? _b : "";
    const [mailTokenPrefix, mailTokenPath] = mailToken.split(".");
    const currentMailToken = (_c = (mailTokenPrefix === "ENV" ? process.env[mailTokenPath] : mailToken)) !== null && _c !== void 0 ? _c : "";
    const link = `${resetPasswordUrl}/${token}/${tokenId}`;
    const body = `<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; text-align: center; padding: 20px;">
  <table width="100%" cellspacing="0" cellpadding="0">
      <tr>
          <td align="center">
              <table width="600" cellspacing="0" cellpadding="0" style="background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
                  <tr>
                      <td align="center">
                          <h2>Password Reset Request</h2>
                          <p>If you requested a password reset, click the button below to reset your password.</p>
                          <p>If you did not request this, please ignore this email.</p>
                          <p>
                              <a href="${link}" style="display: inline-block; padding: 12px 20px; font-size: 16px; color: #ffffff; background: #007bff; text-decoration: none; border-radius: 5px;">Reset Password</a>
                          </p>
                          <p style="margin-top: 20px; font-size: 12px; color: #777;">If the button does not work, copy and paste the following link into your browser:</p>
                          <p style="font-size: 12px; color: #777;">${link}</p>
                      </td>
                  </tr>
              </table>
          </td>
      </tr>
  </table>
</body>`;
    return {
        from: currentSender !== null && currentSender !== void 0 ? currentSender : "",
        subject: currentSubject,
        mailToken: currentMailToken,
        body
    };
};
exports.getMailConfig = getMailConfig;
