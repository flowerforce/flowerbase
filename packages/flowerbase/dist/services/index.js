"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.services = void 0;
const api_1 = __importDefault(require("./api"));
const aws_1 = __importDefault(require("./aws"));
const mongodb_atlas_1 = __importDefault(require("./mongodb-atlas"));
exports.services = {
    api: api_1.default,
    aws: aws_1.default,
    'mongodb-atlas': mongodb_atlas_1.default
};
