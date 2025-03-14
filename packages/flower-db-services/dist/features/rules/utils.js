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
exports.loadRules = void 0;
const fs_1 = __importDefault(require("fs"));
const node_path_1 = __importDefault(require("node:path"));
const utils_1 = require("../../utils");
const loadRules = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (rootDir = process.cwd()) {
    const rulesRoot = node_path_1.default.join(rootDir, 'data_sources', 'mongodb-atlas');
    const files = fs_1.default.readdirSync(rulesRoot, { recursive: true });
    const rulesFiles = files.filter((x) => x.endsWith('rules.json'));
    const rulesByCollection = rulesFiles.reduce((acc, rulesFile) => {
        const filePath = node_path_1.default.join(rulesRoot, rulesFile);
        const collectionRules = (0, utils_1.readJsonContent)(filePath);
        acc[collectionRules.collection] = collectionRules;
        return acc;
    }, {});
    return rulesByCollection;
});
exports.loadRules = loadRules;
