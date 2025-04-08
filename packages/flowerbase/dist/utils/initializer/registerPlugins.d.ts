import { FastifyInstance } from 'fastify';
import { Functions } from '../../features/functions/interface';
type RegisterFunction = FastifyInstance['register'];
type RegisterPluginsParams = {
    register: RegisterFunction;
    mongodbUrl: string;
    jwtSecret: string;
    functionsList: Functions;
};
/**
 * > Used to register all plugins
 * @param register -> the fastify register method
 * @param mongodbUrl -> the database connection string
 * @param jwtSecret -> connection jwt
 * @tested
 */
export declare const registerPlugins: ({ register, mongodbUrl, jwtSecret, functionsList }: RegisterPluginsParams) => Promise<void>;
export {};
//# sourceMappingURL=registerPlugins.d.ts.map