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
exports.generateToken = exports.comparePassword = exports.hashPassword = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_util_1 = require("node:util");
const scrypt = (0, node_util_1.promisify)(node_crypto_1.default.scrypt);
/**
 * > Creates the hash for a string
 * @param plaintext -> the string that should be encrypted
 * @tested
 */
const hashPassword = (plaintext) => __awaiter(void 0, void 0, void 0, function* () {
    const salt = node_crypto_1.default.randomBytes(128).toString('hex');
    const buffer = (yield scrypt(plaintext, salt, 64));
    return `${buffer.toString('hex')}.${salt}`;
});
exports.hashPassword = hashPassword;
/**
 * > Compares two strings
 * @param plaintext -> the first string
 * @param storedPassword -> the second string
 * @tested
 */
const comparePassword = (plaintext, storedPassword) => __awaiter(void 0, void 0, void 0, function* () {
    const [storedHash, storedSalt] = storedPassword.split('.');
    const storedBuffer = Buffer.from(storedHash, 'hex');
    const buffer = (yield scrypt(plaintext, storedSalt, 64));
    return node_crypto_1.default.timingSafeEqual(buffer, storedBuffer);
});
exports.comparePassword = comparePassword;
/**
 * > Generate a random token
 * @param length -> the token length
 */
const generateToken = (length = 32) => {
    return node_crypto_1.default.randomBytes(length).toString('hex');
};
exports.generateToken = generateToken;
