import { ExecuteQueryParams, Functions } from './interface';
/**
 * > Loads the functions config json file
 * @testable
 */
export declare const loadFunctions: (rootDir?: string) => Promise<Functions>;
/**
 * > Executes a single query
 * @param currentMethod -> the method that should be called
 * @param query -> the query data
 * @param update -> the update Document that should be deserialized
 */
export declare const executeQuery: ({ currentMethod, query, update, document }: ExecuteQueryParams) => Promise<{
    find: () => Promise<any[]>;
    findOne: () => Promise<unknown>;
    deleteOne: () => Promise<import("mongodb").DeleteResult>;
    insertOne: () => Promise<import("mongodb").InsertOneResult<import("bson").Document>>;
    updateOne: () => Promise<unknown> | import("mongodb").FindCursor<any>;
}>;
//# sourceMappingURL=utils.d.ts.map