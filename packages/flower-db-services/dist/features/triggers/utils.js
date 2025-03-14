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
exports.TRIGGER_HANDLERS = exports.loadTriggers = void 0;
const fs_1 = __importDefault(require("fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_cron_1 = __importDefault(require("node-cron"));
const constants_1 = require("../../constants");
const utils_1 = require("../../utils");
const context_1 = require("../../utils/context");
/**
 * Loads trigger files from the specified directory and returns them as an array of objects.
 * Each object contains the file name and the parsed JSON content.
 *
 * @testable
 * @param {string} [rootDir=process.cwd()] - The root directory from which to load the triggers. Defaults to the current working directory.
 * @returns {Promise<Triggers>} A promise that resolves to an array of trigger objects.
 */
const loadTriggers = (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (rootDir = process.cwd()) {
    const triggersPath = node_path_1.default.join(rootDir, 'triggers');
    const files = fs_1.default.readdirSync(triggersPath);
    const triggers = files
        .filter((fileName) => fileName.endsWith('.json'))
        .map((fileName) => ({
        fileName,
        content: (0, utils_1.readJsonContent)(node_path_1.default.join(triggersPath, fileName))
    }));
    return triggers;
});
exports.loadTriggers = loadTriggers;
/**
 * Handles the scheduling of a cron job and triggers the appropriate function.
 *
 * @testable
 * @param {Object} params - The parameters for the handler.
 * @param {Object} params.config - Configuration object for the cron trigger.
 * @param {string} params.config.schedule - Cron schedule string (e.g., "* * * * *" for every minute).
 * @param {Function} params.triggerHandler - The function to be triggered when the cron job executes.
 * @param {Array<Function>} params.functionsList - List of available functions.
 * @param {Object} params.services - Services available to the handler.
 * @param {Object} params.app - The app instance for context.
 */
const handleCronTrigger = (_a) => __awaiter(void 0, [_a], void 0, function* ({ config, triggerHandler, functionsList, services, app }) {
    node_cron_1.default.schedule(config.schedule, () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, context_1.GenerateContext)({
            args: [],
            app,
            rules: {},
            user: {},
            currentFunction: triggerHandler,
            functionsList,
            services
        });
    }));
});
const handleAuthenticationTrigger = (_a) => __awaiter(void 0, [_a], void 0, function* ({ config, triggerHandler, functionsList, services, app }) {
    const { database } = config;
    const pipeline = [{
            $match: {
                operationType: { $in: ["INSERT"] }
            }
        }];
    const changeStream = app.mongo.client.db(database).collection(constants_1.AUTH_CONFIG.authCollection).watch(pipeline, {
        fullDocument: 'whenAvailable'
    });
    changeStream.on('change', function (change) {
        return __awaiter(this, void 0, void 0, function* () {
            const document = change["fullDocument"]; //TODO -> define user type
            if (document) {
                delete document.password;
                const currentUser = Object.assign({}, document);
                delete currentUser.password;
                yield (0, context_1.GenerateContext)({
                    args: [{ user: currentUser }],
                    app,
                    rules: {},
                    user: {},
                    currentFunction: triggerHandler,
                    functionsList,
                    services
                });
            }
        });
    });
});
/**
 * Handles a database trigger by watching changes in a specified collection and triggering the appropriate handler.
 *
 * @testable
 * @param {Object} params - The parameters for the handler.
 * @param {Object} params.config - Configuration object for the database trigger.
 * @param {string} params.config.database - The name of the database to watch.
 * @param {string} params.config.collection - The name of the collection to watch.
 * @param {Array<string>} [params.config.operation_types=[]] - List of operation types to watch (e.g., "insert", "update").
 * @param {Object} [params.config.match={}] - Additional match criteria for the change stream.
 * @param {Object} [params.config.project={}] - Projection to apply to the change stream results.
 * @param {boolean} [params.config.full_document] - Whether to include the full document in the change stream results.
 * @param {boolean} [params.config.full_document_before_change] - Whether to include the full document before the change.
 * @param {Function} params.triggerHandler - The function to be triggered on database changes.
 * @param {Array<Function>} params.functionsList - List of available functions.
 * @param {Object} params.services - Services available to the handler.
 * @param {Object} params.app - The app instance for context.
 */
const handleDataBaseTrigger = (_a) => __awaiter(void 0, [_a], void 0, function* ({ config, triggerHandler, functionsList, services, app }) {
    const { database, collection: collectionName, operation_types = [], match = {}, project = {} } = config;
    const collection = app.mongo.client.db(database).collection(collectionName);
    const pipeline = [
        {
            $match: Object.assign({ operationType: { $in: operation_types.map((op) => op.toLowerCase()) } }, match)
        },
        Object.keys(project).length
            ? {
                $project: project
            }
            : undefined
    ].filter(Boolean);
    const changeStream = collection.watch(pipeline, {
        fullDocument: config.full_document ? 'whenAvailable' : undefined,
        fullDocumentBeforeChange: config.full_document_before_change
            ? 'whenAvailable'
            : undefined
    });
    changeStream.on('change', function (change) {
        return __awaiter(this, void 0, void 0, function* () {
            yield (0, context_1.GenerateContext)({
                args: [change],
                app,
                rules: {},
                user: {},
                currentFunction: triggerHandler,
                functionsList,
                services
            });
        });
    });
    // TODO -> gestire close dello stream
});
exports.TRIGGER_HANDLERS = {
    SCHEDULED: handleCronTrigger,
    DATABASE: handleDataBaseTrigger,
    AUTHENTICATION: handleAuthenticationTrigger
};
