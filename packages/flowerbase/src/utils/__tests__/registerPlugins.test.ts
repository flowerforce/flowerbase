import cors from '@fastify/cors'
import fastifyMongodb from '@fastify/mongodb'
import fastifyRawBody from 'fastify-raw-body'
import { authController } from '../../auth/controller'
import jwtAuthPlugin from '../../auth/plugins/jwt'
import { anonUserController } from '../../auth/providers/anon-user/controller'
import { customFunctionController } from '../../auth/providers/custom-function/controller'
import { localUserPassController } from '../../auth/providers/local-userpass/controller'
import { Functions } from '../../features/functions/interface'
import { registerPlugins } from '../initializer/registerPlugins'

const MOCKED_API_VERSION = '/api/client/v2'

jest.mock('../../constants', () => ({
  API_VERSION: '/api/client/v2',
  DEFAULT_CONFIG: {
    MONIT_ENABLED: false
  }
}))

const mockDbUrl = 'mongodb://localhost:27017/testdb'
const mockSecret = 'test-secret'

const errorMock = jest.fn().mockImplementation(() => {
  throw new Error('Plugin registration failed')
})
const registerMock = jest.fn()

describe('registerPlugins', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should register all plugins successfully', async () => {
    await registerPlugins({
      register: registerMock,
      mongodbUrl: mockDbUrl,
      jwtSecret: mockSecret,
      functionsList: {} as Functions
    })

    // Check Plugins Registration
    expect(registerMock).toHaveBeenCalledTimes(8)
    expect(registerMock).toHaveBeenCalledWith(cors, {
      origin: '*',
      methods: ['POST', 'GET']
    })
    expect(registerMock).toHaveBeenCalledWith(fastifyMongodb, {
      forceClose: true,
      url: mockDbUrl
    })
    expect(registerMock).toHaveBeenCalledWith(jwtAuthPlugin, { secret: mockSecret })
    expect(registerMock).toHaveBeenCalledWith(authController, {
      prefix: `${MOCKED_API_VERSION}/auth`
    })
    expect(registerMock).toHaveBeenCalledWith(localUserPassController, {
      prefix: `${MOCKED_API_VERSION}/app/:appId/auth/providers/local-userpass`
    })
    expect(registerMock).toHaveBeenCalledWith(fastifyRawBody, {
      field: 'rawBody',
      global: false,
      encoding: 'utf8',
      runFirst: true,
      routes: [],
      jsonContentTypes: []
    })
    expect(registerMock).toHaveBeenCalledWith(customFunctionController, {
      prefix: `${MOCKED_API_VERSION}/app/:appId/auth/providers/custom-function`
    })
    expect(registerMock).toHaveBeenCalledWith(anonUserController, {
      prefix: `${MOCKED_API_VERSION}/app/:appId/auth/providers/anon-user`
    })
  })

  it('should handle errors in the catch block', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => { })
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { })

    await registerPlugins({
      register: errorMock,
      mongodbUrl: mockDbUrl,
      jwtSecret: mockSecret,
      functionsList: {} as Functions
    })

    expect(errorLog).toHaveBeenCalledWith(
      'Error while registering plugins',
      'Plugin registration failed'
    )
    errorLog.mockRestore()
    logSpy.mockRestore()
  })
})
