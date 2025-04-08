export declare const services: {
    api: () => {
        get: <T = null>({ url, headers }: import("./api/model").GetParams) => Promise<{
            status: number;
            headers: import("undici/types/header").IncomingHttpHeaders;
            body: {
                message: string;
            };
        } | import("undici").Dispatcher.ResponseData<T>>;
        post: <T = null>({ scheme, host, path, url: currentUrl, headers, body, encodeBodyAsJSON }: import("./api/model").PostParams) => Promise<{
            status: number;
            headers: import("undici/types/header").IncomingHttpHeaders;
            body: {
                message: string;
            };
        } | import("undici").Dispatcher.ResponseData<T>>;
        put: <T = null>({ scheme, host, path, url: currentUrl, headers, body, encodeBodyAsJSON }: import("./api/model").PutParams) => Promise<{
            status: number;
            headers: import("undici/types/header").IncomingHttpHeaders;
            body: {
                message: string;
            };
        } | import("undici").Dispatcher.ResponseData<T>>;
        delete: <T = null>({ scheme, host, path, url: currentUrl, headers }: import("./api/model").DeleteParams) => Promise<{
            status: number;
            headers: import("undici/types/header").IncomingHttpHeaders;
            body: {
                message: string;
            };
        } | import("undici").Dispatcher.ResponseData<T>>;
    };
    aws: () => {
        lambda: (region: string) => import("aws-sdk").Lambda & {
            Invoke: (...args: Parameters<import("aws-sdk").Lambda["invoke"]>) => Promise<import("aws-sdk/lib/request").PromiseResult<import("aws-sdk/clients/lambda").InvocationResponse, import("aws-sdk").AWSError>>;
            InvokeAsync: import("aws-sdk").Lambda["invokeAsync"];
        };
        s3: (region: string) => import("aws-sdk").S3;
    };
    'mongodb-atlas': import("./mongodb-atlas/model").MongodbAtlasFunction;
};
//# sourceMappingURL=index.d.ts.map