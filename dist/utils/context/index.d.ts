import { GenerateContextParams } from './interface';
/**
 * > Used to generate the current context
 * @testable
 * @param args -> generic arguments
 * @param app -> the fastify instance
 * @param rules -> the rules object
 * @param user -> the current user
 * @param currentFunction -> the function's name that should be called
 * @param functionsList -> the list of all functions
 * @param services -> the list of all services
 */
export declare function GenerateContext({ args, app, rules, user, currentFunction, functionsList, services }: GenerateContextParams): Promise<any>;
//# sourceMappingURL=index.d.ts.map