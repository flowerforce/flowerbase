import { mongodb } from '@fastify/mongodb';
import { Arguments } from '../../auth/dtos';
import { GenerateContextDataParams } from './interface';
/**
 * > Used to generate the current context data
 * @testable
 * @param user -> the current user
 * @param services -> the list of all services
 * @param app -> the fastify instance
 * @param rules -> the rules object
 * @param currentFunction -> the function's name that should be called
 * @param functionsList -> the list of all functions
 */
export declare const generateContextData: ({ user, services, app, rules, currentFunction, functionsList, GenerateContext }: GenerateContextDataParams) => {
    BSON: typeof mongodb.BSON;
    console: {
        log: (...args: Arguments) => void;
    };
    context: {
        user: unknown;
        environment: {
            tag: string | undefined;
        };
        values: {
            get: (key: string) => string | undefined;
        };
        services: {
            get: (serviceName: keyof typeof services) => {
                db: (dbName: string) => {
                    collection: (collName: string) => ReturnType<import("../../services/mongodb-atlas/model").GetOperatorsFunction>;
                };
            } | {
                get: <T = null>({ url, headers }: import("../../services/api/model").GetParams) => Promise<{
                    status: number;
                    headers: import("undici/types/header").IncomingHttpHeaders;
                    body: {
                        message: string;
                    };
                } | import("undici").Dispatcher.ResponseData<T>>;
                post: <T = null>({ scheme, host, path, url: currentUrl, headers, body, encodeBodyAsJSON }: import("../../services/api/model").PostParams) => Promise<{
                    status: number;
                    headers: import("undici/types/header").IncomingHttpHeaders;
                    body: {
                        message: string;
                    };
                } | import("undici").Dispatcher.ResponseData<T>>;
                put: <T = null>({ scheme, host, path, url: currentUrl, headers, body, encodeBodyAsJSON }: import("../../services/api/model").PutParams) => Promise<{
                    status: number;
                    headers: import("undici/types/header").IncomingHttpHeaders;
                    body: {
                        message: string;
                    };
                } | import("undici").Dispatcher.ResponseData<T>>;
                delete: <T = null>({ scheme, host, path, url: currentUrl, headers }: import("../../services/api/model").DeleteParams) => Promise<{
                    status: number;
                    headers: import("undici/types/header").IncomingHttpHeaders;
                    body: {
                        message: string;
                    };
                } | import("undici").Dispatcher.ResponseData<T>>;
            } | {
                lambda: (region: string) => import("aws-sdk").Lambda & {
                    Invoke: (...args: Parameters<import("aws-sdk").Lambda["invoke"]>) => Promise<import("aws-sdk/lib/request").PromiseResult<import("aws-sdk/clients/lambda").InvocationResponse, import("aws-sdk").AWSError>>;
                    InvokeAsync: import("aws-sdk").Lambda["invokeAsync"];
                };
                s3: (region: string) => import("aws-sdk").S3;
            } | undefined;
        };
        functions: {
            execute: (name: keyof typeof functionsList, ...args: Arguments) => Promise<void>;
        };
    };
};
//# sourceMappingURL=helpers.d.ts.map