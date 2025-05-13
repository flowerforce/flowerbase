import cors from '@fastify/cors'
import fastifyMongodb from '@fastify/mongodb'
import { authController } from '../../auth/controller'
import jwtAuthPlugin from '../../auth/plugins/jwt'
import { localUserPassController } from '../../auth/providers/local-userpass/controller'
import { Functions } from '../../features/functions/interface'
import { registerPlugins } from '../initializer/registerPlugins'

const MOCKED_API_VERSION = '/api/client/v2'

jest.mock('../../constants', () => ({
  API_VERSION: '/api/client/v2'
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
    expect(registerMock).toHaveBeenCalledTimes(5)
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
  })

  it('should handle errors in the catch block', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {})

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
  })
})
