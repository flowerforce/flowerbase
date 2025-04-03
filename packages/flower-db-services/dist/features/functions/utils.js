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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeQuery = exports.loadFunctions = void 0;
const fs_1 = __importDefault(require("fs"));
const node_path_1 = __importDefault(require("node:path"));
const bson_1 = require("bson");
/**
 * > Loads the functions config json file
 * @testable
 */
const loadFunctions = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (rootDir = process.cwd()) {
    const fnDir = 'functions';
    const configFile = node_path_1.default.join(rootDir, fnDir, 'config.json');
    const config = JSON.parse(fs_1.default.readFileSync(configFile, 'utf-8'));
    const functions = config.reduce((acc, _a) => {
        var { name } = _a, opts = __rest(_a, ["name"]);
        const extensions = ['.js', '.ts'];
        let code = '';
        const fnPath = extensions
            .map(ext => node_path_1.default.join(rootDir, fnDir, `${name}${ext}`))
            .find(fs_1.default.existsSync);
        if (!fnPath) {
            throw new Error(`File ${name}.js or ${name}.ts not found`);
        }
        code = fs_1.default.readFileSync(fnPath, 'utf-8');
        acc[name] = Object.assign({ code }, opts);
        return acc;
    }, {});
    return functions;
});
exports.loadFunctions = loadFunctions;
/**
 * > Executes a single query
 * @param currentMethod -> the method that should be called
 * @param query -> the query data
 * @param update -> the update Document that should be deserialized
 */
const executeQuery = (_a) => __awaiter(void 0, [_a], void 0, function* ({ currentMethod, query, update, document }) {
    return {
        find: () => __awaiter(void 0, void 0, void 0, function* () {
            return yield currentMethod(bson_1.EJSON.deserialize(query)).toArray();
        }),
        findOne: () => currentMethod(bson_1.EJSON.deserialize(query)),
        deleteOne: () => currentMethod(bson_1.EJSON.deserialize(query)),
        insertOne: () => currentMethod(bson_1.EJSON.deserialize(document)),
        updateOne: () => currentMethod(bson_1.EJSON.deserialize(query), bson_1.EJSON.deserialize(update)),
        aggregate: () => currentMethod(bson_1.EJSON.deserialize(query)),
        insertMany: () => currentMethod(bson_1.EJSON.deserialize(query)),
        updateMany: () => currentMethod(bson_1.EJSON.deserialize(query), bson_1.EJSON.deserialize(update)),
    };
});
exports.executeQuery = executeQuery;
