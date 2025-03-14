import { DeleteParams, GetParams, PostParams, PutParams } from './model';
/**
 * > This service is the Api Client that can be imported from the context
 */
declare const Api: () => {
    get: <T = null>({ url, headers }: GetParams) => Promise<{
        status: number;
        headers: import("undici/types/header").IncomingHttpHeaders;
        body: {
            message: string;
        };
    } | import("undici").Dispatcher.ResponseData<T>>;
    post: <T = null>({ scheme, host, path, url: currentUrl, headers, body, encodeBodyAsJSON }: PostParams) => Promise<{
        status: number;
        headers: import("undici/types/header").IncomingHttpHeaders;
        body: {
            message: string;
        };
    } | import("undici").Dispatcher.ResponseData<T>>;
    put: <T = null>({ scheme, host, path, url: currentUrl, headers, body, encodeBodyAsJSON }: PutParams) => Promise<{
        status: number;
        headers: import("undici/types/header").IncomingHttpHeaders;
        body: {
            message: string;
        };
    } | import("undici").Dispatcher.ResponseData<T>>;
    delete: <T = null>({ scheme, host, path, url: currentUrl, headers }: DeleteParams) => Promise<{
        status: number;
        headers: import("undici/types/header").IncomingHttpHeaders;
        body: {
            message: string;
        };
    } | import("undici").Dispatcher.ResponseData<T>>;
};
export default Api;
//# sourceMappingURL=index.d.ts.map