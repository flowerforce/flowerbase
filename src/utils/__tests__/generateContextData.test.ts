import Fastify from 'fastify'
import { User } from '../../auth/dtos';
import { Functions } from '../../features/functions/interface';
import { Rules } from '../../features/rules/interface'
import { services } from "../../services";
import { generateContextData } from "../context/helpers";

const originalEnv = process.env;

jest.mock('../../services', () => ({
    services: {
        api: jest.fn(),
        aws: jest.fn(),
        'mongodb-atlas': jest.fn(),
    },
}));

const mockFunctions = {
    test: {
        name: "test",
        code: "test"
    }
} as Functions

const currentFunction = mockFunctions.test
const GenerateContextMock = jest.fn()
const mockUser = {} as User
const mockRules = {} as Rules
const mockEnv = {
    ...originalEnv,
    test: "someTestVariable",
    NODE_ENV: "dev",
};


describe('generateContextData', () => {
    beforeEach(() => {
        jest.resetModules();
        process.env = mockEnv
        jest.clearAllMocks();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('should return an object with context configuration', async () => {

        const mockApp = Fastify()
        const { context, console: contextConsole } = generateContextData({ services, app: mockApp, functionsList: mockFunctions, currentFunction, GenerateContext: GenerateContextMock, user: mockUser, rules: mockRules })
        expect(context.user).toEqual(mockUser)

        const testVariable = context.values.get("test")
        expect(testVariable).toBe(mockEnv.test)

        expect(context.environment.tag).toBe(mockEnv.NODE_ENV)

        expect(context.user).toEqual(mockUser)

        const mockedLog = jest.spyOn(console, 'log').mockImplementation(() => { });
        contextConsole.log('Test', 'generateContextData')
        expect(mockedLog).toHaveBeenCalledWith('Test', 'generateContextData');
        mockedLog.mockRestore();

        context.services.get("api")
        expect(services.api).toHaveBeenCalled()
        const mockErrorLog = jest.spyOn(console, 'error').mockImplementation(() => { })
        context.services.get("notfound" as keyof typeof services)
        expect(mockErrorLog).toHaveBeenCalled()
        mockErrorLog.mockRestore()

        context.functions.execute("test")
        expect(GenerateContextMock).toHaveBeenCalled()
    });
});
