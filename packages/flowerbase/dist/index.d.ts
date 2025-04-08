import 'dotenv/config';
export * from "./model";
export type InitializeConfig = {
    projectId: string;
    mongodbUrl?: string;
    jwtSecret?: string;
    port?: number;
    host?: string;
};
/**
 * > Used to initialize fastify app
 * @param projectId -> the project id string
 * @param host -> the host string
 * @param jwtSecret -> connection jwt
 * @param port -> the serve port number
 * @param mongodbUrl -> the database connection string
 */
export declare function initialize({ projectId, host, jwtSecret, port, mongodbUrl }: InitializeConfig): Promise<void>;
//# sourceMappingURL=index.d.ts.map