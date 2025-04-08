import { MakeRequestParams } from './model';
/**
 * > Creates the http request
 * @param method -> the HTTP METHOD
 * @param url -> url string
 * @param headers -> request headers
 * @param body -> request body
 */
export declare const makeRequest: <T = null>({ method, url, headers, body }: MakeRequestParams) => Promise<import("undici").Dispatcher.ResponseData<T> | {
    status: number;
    headers: import("undici/types/header").IncomingHttpHeaders;
    body: {
        message: string;
    };
}>;
//# sourceMappingURL=utils.d.ts.map