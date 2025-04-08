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
    deleteOne: () => Promise<unknown>;
    insertOne: () => Promise<import("mongodb/mongodb").InsertOneResult<import("bson").Document>>;
    updateOne: () => Promise<unknown> | import("mongodb/mongodb").FindCursor<any> | import("mongodb/mongodb").ChangeStream<import("bson").Document, import("bson").Document> | import("mongodb/mongodb").AggregationCursor<import("bson").Document>;
    aggregate: () => import("mongodb/mongodb").AggregationCursor<import("bson").Document>;
    insertMany: () => Promise<import("mongodb/mongodb").InsertManyResult<import("bson").Document>>;
    updateMany: () => Promise<import("mongodb/mongodb").UpdateResult<import("bson").Document>>;
}>;
//# sourceMappingURL=utils.d.ts.map