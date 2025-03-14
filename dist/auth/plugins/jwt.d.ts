type Options = {
    secret: string;
};
/**
 * This module is a Fastify plugin that sets up JWT-based authentication and token creation.
 * It registers JWT authentication, and provides methods to create access and refresh tokens.
 * @testable
 * @param {import('fastify').FastifyInstance} fastify - The Fastify instance.
 * @param {Object} opts - Options for the plugin.
 * @param {string} opts.secret - The secret key used for signing JWTs.
 */
declare const _default: (fastify: import("fastify").FastifyInstance<import("fastify").RawServerDefault, import("http").IncomingMessage, import("http").ServerResponse<import("http").IncomingMessage>, import("fastify").FastifyBaseLogger, import("fastify").FastifyTypeProviderDefault>, opts: Options) => Promise<void>;
export default _default;
//# sourceMappingURL=jwt.d.ts.map