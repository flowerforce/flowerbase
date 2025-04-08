"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateContextData = void 0;
const mongodb_1 = require("@fastify/mongodb");
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
const generateContextData = ({ user, services, app, rules, currentFunction, functionsList, GenerateContext }) => ({
    BSON: mongodb_1.mongodb.BSON,
    console: {
        log: (...args) => {
            console.log(...args);
        }
    },
    context: {
        user,
        environment: {
            tag: process.env.NODE_ENV
        },
        values: {
            get: (key) => process.env[key],
        },
        services: {
            get: (serviceName) => {
                try {
                    return services[serviceName](app, {
                        rules,
                        user,
                        run_as_system: currentFunction.run_as_system
                    });
                }
                catch (error) {
                    console.error('Something went wrong while generating context function', serviceName, error);
                }
            }
        },
        functions: {
            execute: (name, ...args) => {
                const currentFunction = functionsList[name];
                return GenerateContext({
                    args,
                    app,
                    rules,
                    user,
                    currentFunction,
                    functionsList,
                    services
                });
            }
        }
    }
});
exports.generateContextData = generateContextData;
