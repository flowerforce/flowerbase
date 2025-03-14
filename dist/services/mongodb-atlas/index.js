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
const mongodb_1 = require("mongodb");
const machines_1 = require("../../utils/roles/machines");
const utils_1 = require("../../utils/roles/machines/utils");
const rules_1 = require("../../utils/rules");
const utils_2 = require("./utils");
//TODO aggiungere no-sql inject security
const getOperators = (collection, { rules = {}, collName, user, run_as_system }) => ({
    findOne: (query) => __awaiter(void 0, void 0, void 0, function* () {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // PRE QUERY -> build the right filter
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            // QUERY -> findOne document with the formatted Query
            const result = yield collection.findOne({ $and: formattedQuery });
            // POST QUERY -> check the if the user can read the document
            const winningRole = (0, utils_1.getWinningRole)(result, user, roles);
            const { status, document } = winningRole ? yield (0, machines_1.checkValidation)(winningRole, {
                type: "read",
                roles,
                cursor: result,
                expansions: {},
            }, user) : { status: true, document: result };
            return Promise.resolve(status ? document : {});
        }
        return collection.findOne(query);
    }),
    deleteOne: (query) => __awaiter(void 0, void 0, void 0, function* () {
        if (!run_as_system) {
            const { roles } = rules[collName] || {};
            const currentRules = (0, utils_2.getValidRule)({ filters: roles, user });
            const deleteForbidden = !!(currentRules === null || currentRules === void 0 ? void 0 : currentRules.length) && currentRules[0].delete === false;
            if (deleteForbidden) {
                throw new Error('Delete not permitted');
            }
        }
        return collection.deleteOne(query);
    }),
    insertOne: (data) => __awaiter(void 0, void 0, void 0, function* () {
        const { roles } = rules[collName] || {};
        if (!run_as_system) {
            const currentRules = (0, utils_2.getValidRule)({
                filters: roles,
                user,
                record: Object.assign(Object.assign(Object.assign({}, data), data.$set), data.$setOnInsert)
            });
            const insertForbidden = !!(currentRules === null || currentRules === void 0 ? void 0 : currentRules.length) && currentRules[0].insert === false;
            if (insertForbidden) {
                throw new Error('Insert not permitted');
            }
        }
        return collection.insertOne(data);
    }),
    updateOne: (query, data) => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        const { roles, filters } = rules[collName];
        const currentRules = (0, utils_2.getValidRule)({
            filters: roles,
            user,
            record: Object.assign(Object.assign(Object.assign({}, data), data.$set), data.$setOnInsert)
        });
        const updateForbidden = !!(currentRules === null || currentRules === void 0 ? void 0 : currentRules.length) && currentRules[0].write === false;
        if (updateForbidden) {
            throw new Error('Update not permitted');
        }
        const preFilter = run_as_system ? undefined : (0, utils_2.getValidRule)({ filters, user });
        const isValidPreFilter = !!(preFilter === null || preFilter === void 0 ? void 0 : preFilter.length);
        const formattedQuery = [
            isValidPreFilter && (0, rules_1.expandQuery)((_a = preFilter[0]) === null || _a === void 0 ? void 0 : _a.query, { '%%user': user }),
            query
        ].filter(Boolean);
        // TODO -> fare filtro reale
        return collection.updateOne({ $and: formattedQuery }, data);
    }),
    find: (query) => {
        const { filters, roles } = rules[collName] || {};
        const preFilter = run_as_system ? undefined : (0, utils_2.getValidRule)({ filters, user });
        const isValidPreFilter = !!(preFilter === null || preFilter === void 0 ? void 0 : preFilter.length);
        const formattedQuery = [
            isValidPreFilter && (0, rules_1.expandQuery)(preFilter[0].query, { '%%user': user }),
            query
        ].filter(Boolean);
        // QUERY -> find documents with the formatted Query
        const originalCursor = collection.find({ $and: formattedQuery });
        // CURSOR -> create a cloned cursor to manipulate the response
        const client = originalCursor['client'];
        const newCursor = new mongodb_1.FindCursor(client);
        newCursor.toArray = () => __awaiter(void 0, void 0, void 0, function* () {
            const response = yield originalCursor.toArray();
            const filteredResponse = yield Promise.all(response.map((currentDoc) => __awaiter(void 0, void 0, void 0, function* () {
                const winningRole = (0, utils_1.getWinningRole)(currentDoc, user, roles);
                // POST QUERY -> check the if the user can read the single document
                const { status, document } = winningRole ? yield (0, machines_1.checkValidation)(winningRole, {
                    type: "read",
                    roles,
                    cursor: currentDoc,
                    expansions: {},
                }, user) : { status: !roles.length, document: currentDoc };
                return status ? document : undefined;
            })));
            return filteredResponse.filter(Boolean);
        });
        return newCursor;
    },
    watch: (pipeline, options) => __awaiter(void 0, void 0, void 0, function* () { return collection.watch(pipeline, options); })
});
const MongodbAtlas = (app, { rules, user, run_as_system } = {}) => ({
    db: (dbName) => {
        return {
            collection: (collName) => {
                const collection = app.mongo.client
                    .db(dbName)
                    .collection(collName);
                return getOperators(collection, { rules, collName, user, run_as_system });
            }
        };
    }
});
exports.default = MongodbAtlas;
