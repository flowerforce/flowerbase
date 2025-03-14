import { HandlerParams, Triggers } from './interface';
/**
 * Loads trigger files from the specified directory and returns them as an array of objects.
 * Each object contains the file name and the parsed JSON content.
 *
 * @testable
 * @param {string} [rootDir=process.cwd()] - The root directory from which to load the triggers. Defaults to the current working directory.
 * @returns {Promise<Triggers>} A promise that resolves to an array of trigger objects.
 */
export declare const loadTriggers: (rootDir?: string) => Promise<Triggers>;
export declare const TRIGGER_HANDLERS: {
    SCHEDULED: ({ config, triggerHandler, functionsList, services, app }: HandlerParams) => Promise<void>;
    DATABASE: ({ config, triggerHandler, functionsList, services, app }: HandlerParams) => Promise<void>;
    AUTHENTICATION: ({ config, triggerHandler, functionsList, services, app }: HandlerParams) => Promise<void>;
};
//# sourceMappingURL=utils.d.ts.map