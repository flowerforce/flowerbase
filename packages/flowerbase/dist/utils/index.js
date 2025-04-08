"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readJsonContent = exports.readFileContent = void 0;
const fs_1 = __importDefault(require("fs"));
const readFileContent = (filePath) => fs_1.default.readFileSync(filePath, 'utf-8');
exports.readFileContent = readFileContent;
const readJsonContent = (filePath) => JSON.parse((0, exports.readFileContent)(filePath));
exports.readJsonContent = readJsonContent;
