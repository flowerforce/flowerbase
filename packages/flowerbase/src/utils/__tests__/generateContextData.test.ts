import Fastify from 'fastify'
import * as jwt from 'jsonwebtoken'
import { User } from '../../auth/dtos'
import { Functions } from '../../features/functions/interface'
import { Rules } from '../../features/rules/interface'
import { services } from '../../services'
import { contextUserForRun, generateContextData, REALM_SYSTEM_USER } from '../context/helpers'

const originalEnv = process.env

jest.mock('../../services', () => ({
  services: {
    api: jest.fn(),
    aws: jest.fn(),
    'mongodb-atlas': jest.fn()
  }
}))

const mockFunctions = {
  test: {
    name: 'test',
    code: 'test'
  }
} as Functions

const currentFunction = mockFunctions.test
const GenerateContextMock = jest.fn()
const GenerateContextSyncMock = jest.fn()
const mockUser = {} as User
const mockRules = {} as Rules
const mockEnv = {
  ...originalEnv,
  test: 'someTestVariable',
  NODE_ENV: 'dev'
}

describe('generateContextData', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env = mockEnv
    jest.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('should return an object with context configuration', async () => {
    const mockApp = Fastify()
    const { context, console: contextConsole, BSON } = generateContextData({
      services,
      app: mockApp,
      functionsList: mockFunctions,
      currentFunction,
      GenerateContext: GenerateContextMock,
      GenerateContextSync: GenerateContextSyncMock,
      user: mockUser,
      rules: mockRules
    })
    expect(context.user).toEqual(mockUser)

    const testVariable = context.values.get('test')
    expect(testVariable).toBe(mockEnv.test)

    expect(context.environment.tag).toBe(mockEnv.NODE_ENV)

    expect(context.user).toEqual(mockUser)

    const mockedLog = jest.spyOn(console, 'log').mockImplementation(() => { })
    contextConsole.log('Test', 'generateContextData')
    expect(mockedLog).toHaveBeenCalledWith('Test', 'generateContextData')
    mockedLog.mockRestore()

    context.services.get('api')
    expect(services.api).toHaveBeenCalled()
    const mockErrorLog = jest.spyOn(console, 'error').mockImplementation(() => { })
    context.services.get('notfound' as keyof typeof services)
    expect(mockErrorLog).toHaveBeenCalled()
    mockErrorLog.mockRestore()

    context.functions.execute('test')
    expect(GenerateContextSyncMock).toHaveBeenCalledWith(expect.objectContaining({
      currentFunction,
      functionName: 'test',
      runAsSystem: currentFunction.run_as_system
    }))

    const token = jwt.sign(
      { sub: 'user', role: 'admin' },
      'secret',
      { algorithm: 'HS256', header: { alg: 'HS256', typ: 'JWT' }, noTimestamp: true }
    )
    const decoded = context.utils.jwt.decode(token, 'secret')
    expect(decoded).toEqual({ sub: 'user', role: 'admin' })

    const decodedWithHeader = context.utils.jwt.decode(token, 'secret', true, ['HS256']) as {
      header: jwt.JwtHeader
      payload: unknown
    }
    expect(decodedWithHeader.payload).toEqual({ sub: 'user', role: 'admin' })
    expect(decodedWithHeader.header).toEqual(
      expect.objectContaining({ alg: 'HS256', typ: 'JWT' })
    )

    const base64 = Buffer.from('test').toString('base64')
    const Binary = BSON.Binary as typeof BSON.Binary & {
      fromBase64: (base64: string, subType?: number) => Uint8Array
      fromBase64Binary: (base64: string, subType?: number) => InstanceType<typeof BSON.Binary>
    }
    const binaryValue = Binary.fromBase64(base64, 0)
    expect(binaryValue).toBeInstanceOf(Uint8Array)
    expect(Buffer.from(binaryValue).toString('utf8')).toBe('test')
    const binaryObject = Binary.fromBase64Binary(base64, 0)
    expect(binaryObject).toBeInstanceOf(BSON.Binary)
  })

  it('exposes Realm system user and runningAsSystem when run_as_system is enabled', () => {
    const mockApp = Fastify()
    const systemFunction = { ...currentFunction, run_as_system: true }
    const { context } = generateContextData({
      services,
      app: mockApp,
      functionsList: mockFunctions,
      currentFunction: systemFunction,
      GenerateContext: GenerateContextMock,
      GenerateContextSync: GenerateContextSyncMock,
      user: REALM_SYSTEM_USER,
      rules: mockRules
    })

    expect(context.user).toEqual(REALM_SYSTEM_USER)
    expect(context.runningAsSystem()).toBe(true)
  })

  it('runningAsSystem is false for regular function execution', () => {
    const mockApp = Fastify()
    const { context } = generateContextData({
      services,
      app: mockApp,
      functionsList: mockFunctions,
      currentFunction,
      GenerateContext: GenerateContextMock,
      GenerateContextSync: GenerateContextSyncMock,
      user: { id: 'user-1', type: 'normal', data: {}, custom_data: {}, identities: [] },
      rules: mockRules
    })

    expect(context.runningAsSystem()).toBe(false)
  })
})

describe('contextUserForRun', () => {
  it('returns Realm system user for empty user with run_as_system', () => {
    expect(contextUserForRun({}, true)).toEqual(REALM_SYSTEM_USER)
  })

  it('returns the user unchanged when not running as system', () => {
    const user = { id: 'user-1' }
    expect(contextUserForRun(user, false)).toBe(user)
  })
})
