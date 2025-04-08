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
const isEqual_1 = __importDefault(require("lodash/isEqual"));
const mongodb_1 = require("mongodb");
const machines_1 = require("../../utils/roles/machines");
const utils_1 = require("../../utils/roles/machines/utils");
const utils_2 = require("./utils");
//TODO aggiungere no-sql inject security
const getOperators = (collection, { rules = {}, collName, user, run_as_system }) => ({
    /**
     * Finds a single document in a MongoDB collection with optional role-based filtering and validation.
     *
     * @param {Filter<Document>} query - The MongoDB query used to match the document.
     * @returns {Promise<Document | {} | null>} A promise resolving to the document if found and permitted, an empty object if access is denied, or `null` if not found.
     *
     * @description
     * If `run_as_system` is enabled, the function behaves like a standard `collection.findOne(query)` with no access checks.
     * Otherwise:
     *  - Merges the provided query with any access control filters using `getFormattedQuery`.
     *  - Attempts to find the document using the formatted query.
     *  - Determines the user's role via `getWinningRole`.
     *  - Validates the result using `checkValidation` to ensure read permission.
     *  - If validation fails, returns an empty object; otherwise returns the validated document.
     */
    findOne: (query) => __awaiter(void 0, void 0, void 0, function* () {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Apply access control filters to the query
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            const result = yield collection.findOne({ $and: formattedQuery });
            const winningRole = (0, utils_1.getWinningRole)(result, user, roles);
            const { status, document } = winningRole
                ? yield (0, machines_1.checkValidation)(winningRole, {
                    type: "read",
                    roles,
                    cursor: result,
                    expansions: {},
                }, user)
                : { status: true, document: result };
            // Return validated document or empty object if not permitted
            return Promise.resolve(status ? document : {});
        }
        // System mode: no validation applied
        return collection.findOne(query);
    }),
    /**
     * Deletes a single document from a MongoDB collection with optional role-based validation.
     *
     * @param {Filter<Document>} [query={}] - The MongoDB query used to match the document to delete.
     * @returns {Promise<DeleteResult>} A promise resolving to the result of the delete operation.
     *
     * @throws {Error} If the user is not authorized to delete the document.
     *
     * @description
     * If `run_as_system` is enabled, the function deletes the document directly using `collection.deleteOne(query)`.
     * Otherwise:
     *  - Applies role-based and custom filters to the query using `getFormattedQuery`.
     *  - Retrieves the document using `findOne` to validate user permissions.
     *  - Checks if the user has the appropriate role to perform a delete via `checkValidation`.
     *  - If validation fails, throws an error.
     *  - If validation passes, deletes the document using the filtered query.
     */
    deleteOne: (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (query = {}) {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Apply access control filters
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            // Retrieve the document to check permissions before deleting
            const result = yield collection.findOne(formattedQuery);
            const winningRole = (0, utils_1.getWinningRole)(result, user, roles);
            const { status } = winningRole
                ? yield (0, machines_1.checkValidation)(winningRole, {
                    type: "delete",
                    roles,
                    cursor: result,
                    expansions: {},
                }, user)
                : { status: true };
            if (!status) {
                throw new Error('Delete not permitted');
            }
            return collection.deleteOne(formattedQuery);
        }
        // System mode: bypass access control
        return collection.deleteOne(query);
    }),
    /**
     * Inserts a single document into a MongoDB collection with optional role-based validation.
     *
     * @param {OptionalId<Document>} data - The document to insert.
     * @param {InsertOneOptions} [options] - Optional settings for the insert operation, such as `writeConcern`.
     * @returns {Promise<InsertOneResult<Document>>} A promise resolving to the result of the insert operation.
     *
     * @throws {Error} If the user is not authorized to insert the document.
     *
     * @description
     * If `run_as_system` is enabled, the document is inserted directly without any validation.
     * Otherwise:
     *  - Determines the appropriate user role using `getWinningRole`.
     *  - Validates the insert operation using `checkValidation`.
     *  - If validation fails, an error is thrown.
     *  - If validation passes, the document is inserted.
     *
     * This ensures that only users with the correct permissions can insert data into the collection.
     */
    insertOne: (data, options) => __awaiter(void 0, void 0, void 0, function* () {
        const { roles } = rules[collName] || {};
        if (!run_as_system) {
            const winningRole = (0, utils_1.getWinningRole)(data, user, roles);
            const { status, document } = winningRole
                ? yield (0, machines_1.checkValidation)(winningRole, {
                    type: "insert",
                    roles,
                    cursor: data,
                    expansions: {},
                }, user)
                : { status: true, document: data };
            if (!status || !(0, isEqual_1.default)(data, document)) {
                throw new Error('Insert not permitted');
            }
            return collection.insertOne(data, options);
        }
        // System mode: insert without validation
        return collection.insertOne(data, options);
    }),
    /**
     * Updates a single document in a MongoDB collection with optional role-based validation.
     *
     * @param {Filter<Document>} query - The MongoDB query used to match the document to update.
     * @param {UpdateFilter<Document> | Partial<Document>} data - The update operations or replacement document.
     * @param {UpdateOptions} [options] - Optional settings for the update operation.
     * @returns {Promise<UpdateResult>} A promise resolving to the result of the update operation.
     *
     * @throws {Error} If the user is not authorized to update the document.
     *
     * @description
     * If `run_as_system` is enabled, the function directly updates the document using `collection.updateOne(query, data, options)`.
     * Otherwise, it follows these steps:
     *  - Applies access control filters to the query using `getFormattedQuery`.
     *  - Retrieves the document using `findOne` to check if it exists and whether the user has permission to modify it.
     *  - Determines the user's role via `getWinningRole`.
     *  - Flattens update operators (`$set`, `$inc`, etc.) if present to extract the final modified fields.
     *  - Validates the update data using `checkValidation` to ensure compliance with role-based rules.
     *  - Ensures that no unauthorized modifications occur by comparing the validated document with the intended changes.
     *  - If validation fails, throws an error; otherwise, updates the document.
     */
    updateOne: (query, data, options) => __awaiter(void 0, void 0, void 0, function* () {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Apply access control filters
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            // Retrieve the document to check permissions before updating
            const result = yield collection.findOne({ $and: formattedQuery });
            if (!result) {
                throw new Error('Update not permitted');
            }
            const winningRole = (0, utils_1.getWinningRole)(result, user, roles);
            // Check if the update data contains MongoDB update operators (e.g., $set, $inc)
            const hasOperators = Object.keys(data).some(key => key.startsWith("$"));
            // Flatten the update object to extract the actual fields being modified
            // const docToCheck = hasOperators
            //   ? Object.values(data).reduce((acc, operation) => ({ ...acc, ...operation }), {})
            //   : data
            const pipeline = [
                {
                    $match: formattedQuery,
                },
                {
                    $limit: 1
                },
                ...Object.entries(data).map(([key, value]) => ({ [key]: value })),
            ];
            const [docToCheck] = hasOperators ? yield collection.aggregate(pipeline).toArray() : [data];
            // Validate update permissions
            const { status, document } = winningRole
                ? yield (0, machines_1.checkValidation)(winningRole, {
                    type: "write",
                    roles,
                    cursor: docToCheck,
                    expansions: {},
                }, user)
                : { status: true, document: docToCheck };
            // Ensure no unauthorized changes are made
            const areDocumentsEqual = (0, isEqual_1.default)(document, docToCheck);
            if (!status || !areDocumentsEqual) {
                throw new Error('Update not permitted');
            }
            return collection.updateOne(formattedQuery, data, options);
        }
        return collection.updateOne(query, data, options);
    }),
    /**
    * Finds documents in a MongoDB collection with optional role-based access control and post-query validation.
    *
    * @param {Filter<Document>} query - The MongoDB query to filter documents.
    * @returns {FindCursor} A customized `FindCursor` that includes additional access control logic in its `toArray()` method.
    *
    * @description
    * If `run_as_system` is enabled, the function simply returns a regular MongoDB cursor (`collection.find(query)`).
    * Otherwise:
    *  - Combines the user query with role-based filters via `getFormattedQuery`.
    *  - Executes the query using `collection.find` with a `$and` of all filters.
    *  - Returns a cloned `FindCursor` where `toArray()`:
    *    - Applies additional post-query validation using `checkValidation` for each document.
    *    - Filters out documents the current user is not authorized to read.
    *
    * This ensures that both pre-query filtering and post-query validation are applied consistently.
    */
    find: (query) => {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Pre-query filtering based on access control rules
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            const originalCursor = collection.find({ $and: formattedQuery });
            // Clone the cursor to override `toArray` with post-query validation
            const client = originalCursor['client'];
            const newCursor = new mongodb_1.FindCursor(client);
            /**
             * Overridden `toArray` method that validates each document for read access.
             *
             * @returns {Promise<Document[]>} An array of documents the user is authorized to read.
             */
            newCursor.toArray = () => __awaiter(void 0, void 0, void 0, function* () {
                const response = yield originalCursor.toArray();
                const filteredResponse = yield Promise.all(response.map((currentDoc) => __awaiter(void 0, void 0, void 0, function* () {
                    const winningRole = (0, utils_1.getWinningRole)(currentDoc, user, roles);
                    const { status, document } = winningRole
                        ? yield (0, machines_1.checkValidation)(winningRole, {
                            type: "read",
                            roles,
                            cursor: currentDoc,
                            expansions: {},
                        }, user)
                        : { status: !roles.length, document: currentDoc };
                    return status ? document : undefined;
                })));
                return filteredResponse.filter(Boolean);
            });
            return newCursor;
        }
        // System mode: return original unfiltered cursor
        return collection.find(query);
    },
    /**
   * Watches changes on a MongoDB collection with optional role-based filtering of change events.
   *
   * @param {Document[]} [pipeline=[]] - Optional aggregation pipeline stages to apply to the change stream.
   * @param {ChangeStreamOptions} [options] - Optional settings for the change stream, such as `fullDocument`, `resumeAfter`, etc.
   * @returns {ChangeStream} A MongoDB `ChangeStream` instance, optionally enhanced with access control.
   *
   * @description
   * If `run_as_system` is enabled, this function simply returns `collection.watch(pipeline, options)`.
   * Otherwise:
   *  - Applies access control filters via `getFormattedQuery`.
   *  - Prepends a `$match` stage to the pipeline to limit watched changes to authorized documents.
   *  - Overrides the `.on()` method of the returned `ChangeStream` to:
   *    - Validate the `fullDocument` and any `updatedFields` using `checkValidation`.
   *    - Filter out change events the user is not authorized to see.
   *    - Pass only validated and filtered events to the original listener.
   *
   * This allows fine-grained control over what change events a user can observe, based on roles and filters.
   */
    watch: (pipeline = [], options) => {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Apply access filters to initial change stream pipeline
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, {}, user);
            const formattedPipeline = [{
                    $match: {
                        $and: formattedQuery
                    }
                }, ...pipeline];
            const result = collection.watch(formattedPipeline, options);
            const originalOn = result.on.bind(result);
            /**
             * Validates a change event against the user's roles.
             *
             * @param {Document} change - A change event from the ChangeStream.
             * @returns {Promise<{ status: boolean, document: Document, updatedFieldsStatus: boolean, updatedFields: Document }>}
             */
            const isValidChange = (_a) => __awaiter(void 0, [_a], void 0, function* ({ fullDocument, updateDescription }) {
                const winningRole = (0, utils_1.getWinningRole)(fullDocument, user, roles);
                const { status, document } = winningRole
                    ? yield (0, machines_1.checkValidation)(winningRole, {
                        type: "read",
                        roles,
                        cursor: fullDocument,
                        expansions: {},
                    }, user)
                    : { status: true, document: fullDocument };
                const { status: updatedFieldsStatus, document: updatedFields } = winningRole
                    ? yield (0, machines_1.checkValidation)(winningRole, {
                        type: "read",
                        roles,
                        cursor: updateDescription === null || updateDescription === void 0 ? void 0 : updateDescription.updatedFields,
                        expansions: {},
                    }, user)
                    : { status: true, document: updateDescription === null || updateDescription === void 0 ? void 0 : updateDescription.updatedFields };
                return { status, document, updatedFieldsStatus, updatedFields };
            });
            // Override the .on() method to apply validation before emitting events
            result.on = (eventType, listener) => {
                return originalOn(eventType, (change) => __awaiter(void 0, void 0, void 0, function* () {
                    const { status, document, updatedFieldsStatus, updatedFields } = yield isValidChange(change);
                    if (!status)
                        return;
                    const filteredChange = Object.assign(Object.assign({}, change), { fullDocument: document, updateDescription: Object.assign(Object.assign({}, change.updateDescription), { updatedFields: updatedFieldsStatus ? updatedFields : {} }) });
                    listener(filteredChange);
                }));
            };
            return result;
        }
        // System mode: no filtering applied
        return collection.watch(pipeline, options);
    },
    //TODO -> add filter & rules in aggregate
    aggregate: (pipeline, options) => collection.aggregate(pipeline, options),
    /**
     * Inserts multiple documents into a MongoDB collection with optional role-based access control and validation.
     *
     * @param {OptionalId<Document>[]} documents - The array of documents to insert.
     * @param {BulkWriteOptions} [options] - Optional settings passed to `insertMany`, such as `ordered`, `writeConcern`, etc.
     * @returns {Promise<InsertManyResult<Document>>} A promise resolving to the result of the insert operation.
     *
     * @throws {Error} If no documents pass validation or user is not permitted to insert.
     *
     * @description
     * If `run_as_system` is enabled, this function directly inserts the documents without validation.
     * Otherwise, for each document:
     *  - Finds the user's applicable role using `getWinningRole`.
     *  - Validates the insert operation through `checkValidation`.
     *  - Filters out any documents the user is not authorized to insert.
     * Only documents passing validation will be inserted.
     */
    insertMany: (documents, options) => __awaiter(void 0, void 0, void 0, function* () {
        if (!run_as_system) {
            const { roles } = rules[collName] || {};
            // Validate each document against user's roles
            const filteredItems = yield Promise.all(documents.map((currentDoc) => __awaiter(void 0, void 0, void 0, function* () {
                const winningRole = (0, utils_1.getWinningRole)(currentDoc, user, roles);
                const { status, document } = winningRole
                    ? yield (0, machines_1.checkValidation)(winningRole, {
                        type: "insert",
                        roles,
                        cursor: currentDoc,
                        expansions: {},
                    }, user)
                    : { status: !roles.length, document: currentDoc };
                return status ? document : undefined;
            })));
            const canInsert = (0, isEqual_1.default)(filteredItems, documents);
            if (!canInsert) {
                throw new Error('Insert not permitted');
            }
            return collection.insertMany(documents, options);
        }
        // If system mode is active, insert all documents without validation
        return collection.insertMany(documents, options);
    }),
    updateMany: (query, data, options) => __awaiter(void 0, void 0, void 0, function* () {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Apply access control filters
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            // Retrieve the document to check permissions before updating
            const result = yield collection.find({ $and: formattedQuery }).toArray();
            if (!result) {
                throw new Error('Update not permitted');
            }
            // Check if the update data contains MongoDB update operators (e.g., $set, $inc)
            const hasOperators = Object.keys(data).some(key => key.startsWith("$"));
            // Flatten the update object to extract the actual fields being modified
            // const docToCheck = hasOperators
            //   ? Object.values(data).reduce((acc, operation) => ({ ...acc, ...operation }), {})
            //   : data
            const pipeline = [
                {
                    $match: formattedQuery,
                },
                ...Object.entries(data).map(([key, value]) => ({ [key]: value })),
            ];
            const docsToCheck = hasOperators ? yield collection.aggregate(pipeline).toArray() : result;
            const filteredItems = yield Promise.all(docsToCheck.map((currentDoc) => __awaiter(void 0, void 0, void 0, function* () {
                const winningRole = (0, utils_1.getWinningRole)(currentDoc, user, roles);
                const { status, document } = winningRole
                    ? yield (0, machines_1.checkValidation)(winningRole, {
                        type: "write",
                        roles,
                        cursor: currentDoc,
                        expansions: {},
                    }, user)
                    : { status: !roles.length, document: currentDoc };
                return status ? document : undefined;
            })));
            // Ensure no unauthorized changes are made
            const areDocumentsEqual = (0, isEqual_1.default)(docsToCheck, filteredItems);
            if (!areDocumentsEqual) {
                throw new Error('Update not permitted');
            }
            return collection.updateMany(formattedQuery, data, options);
        }
        return collection.updateMany(query, data, options);
    }),
    /**
     * Deletes multiple documents from a MongoDB collection with role-based access control and validation.
     *
     * @param query - The initial MongoDB query to filter documents to be deleted.
     * @returns {Promise<{ acknowledged: boolean, deletedCount: number }>} A promise resolving to the deletion result.
     *
     * @description
     * If `run_as_system` is enabled, this function directly deletes documents matching the given query.
     * Otherwise, it:
     *  - Applies additional filters from access control rules.
     *  - Fetches matching documents.
     *  - Validates each document against user roles.
     *  - Deletes only the documents that the current user has permission to delete.
     */
    deleteMany: (...args_1) => __awaiter(void 0, [...args_1], void 0, function* (query = {}) {
        if (!run_as_system) {
            const { filters, roles } = rules[collName] || {};
            // Apply access control filters
            const formattedQuery = (0, utils_2.getFormattedQuery)(filters, query, user);
            // Fetch documents matching the combined filters
            const data = yield collection.find({ $and: formattedQuery }).toArray();
            // Filter and validate each document based on user's roles
            const filteredItems = yield Promise.all(data.map((currentDoc) => __awaiter(void 0, void 0, void 0, function* () {
                const winningRole = (0, utils_1.getWinningRole)(currentDoc, user, roles);
                const { status, document } = winningRole
                    ? yield (0, machines_1.checkValidation)(winningRole, {
                        type: "delete",
                        roles,
                        cursor: currentDoc,
                        expansions: {},
                    }, user)
                    : { status: !roles.length, document: currentDoc };
                return status ? document : undefined;
            })));
            // Extract IDs of documents that passed validation
            const elementsToDelete = filteredItems.filter(Boolean).map(({ _id }) => _id);
            if (!elementsToDelete.length) {
                return Promise.resolve({
                    acknowledged: true,
                    deletedCount: 0
                });
            }
            // Build final delete query with access control and ID filter
            const deleteQuery = {
                $and: [
                    ...formattedQuery,
                    { _id: { $in: elementsToDelete } }
                ]
            };
            return collection.deleteMany(deleteQuery);
        }
        // If running as system, bypass access control and delete directly
        return collection.deleteMany(query);
    })
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
