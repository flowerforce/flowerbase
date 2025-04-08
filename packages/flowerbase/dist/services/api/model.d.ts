import { Dispatcher } from 'undici';
type RequestOptions = Dispatcher.RequestOptions;
type HTTP_METHODS = RequestOptions['method'];
type Headers = RequestOptions['headers'];
type Body = RequestOptions['body'];
export interface MakeRequestParams {
    method: HTTP_METHODS;
    url: string;
    headers: Headers;
    body?: Body;
}
export interface GetParams {
    url: string;
    headers: Headers;
}
export interface PostParams {
    scheme?: string;
    url?: string;
    host: string;
    path: string;
    encodeBodyAsJSON?: boolean;
    body: Body;
    headers?: Headers;
}
export type PutParams = PostParams;
export type DeleteParams = Omit<PostParams, 'body' | 'encodeBodyAsJSON'>;
export interface Error {
    message: string;
    statusCode: Dispatcher.ResponseData['statusCode'];
    headers?: Dispatcher.ResponseData['headers'];
}
export {};
//# sourceMappingURL=model.d.ts.map