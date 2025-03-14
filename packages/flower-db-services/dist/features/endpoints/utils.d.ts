import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { Endpoints, GenerateHandlerParams } from './interface';
/**
 * > Loads the endpoint config json file
 * @testable
 */
export declare const loadEndpoints: () => Promise<Endpoints>;
/**
 * > Creates an object with a config for all HTTP methods
 * @testable
 * @param app -> the fastify instance
 * @param handler -> the handler function for that route
 * @param endpoint -> the current endpoint
 */
export declare const getMethodsConfig: (app: FastifyInstance, handler: ReturnType<typeof generateHandler>, endpoint: string) => {
    ALL: () => FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    GET: () => FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    POST: () => FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    PUT: () => FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    PATCH: () => FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
    DELETE: () => FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>;
};
/**
 * > Creates an handler function for a single endpoint
 * @testable
 * @param app -> the fastify instance
 * @param currentFunction -> the name of the function that should be called for that endpoint
 * @param functionsList -> the list of all functions
 */
export declare const generateHandler: ({ app, currentFunction, functionsList }: GenerateHandlerParams) => (req: FastifyRequest, res: FastifyReply) => Promise<{}>;
//# sourceMappingURL=utils.d.ts.map