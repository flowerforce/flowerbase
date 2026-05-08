jest.mock('../../../../constants', () => ({
  AUTH_CONFIG: {
    authCollection: 'auth_users',
    refreshTokensCollection: 'refresh_tokens',
    resetPasswordCollection: 'reset_password_requests',
    userCollection: 'users',
    user_id_field: 'id',
    authProviders: {
      'local-userpass': {
        disabled: false
      }
    },
    resetPasswordConfig: {
      runResetFunction: true,
      resetFunctionName: 'customReset'
    }
  },
  AUTH_DB_NAME: 'test-auth-db',
  DB_NAME: 'test-db',
  DEFAULT_CONFIG: {
    RESET_PASSWORD_TTL_SECONDS: 3600,
    AUTH_RATE_LIMIT_WINDOW_MS: 60000,
    AUTH_LOGIN_MAX_ATTEMPTS: 5,
    AUTH_REGISTER_MAX_ATTEMPTS: 5,
    AUTH_RESET_MAX_ATTEMPTS: 5,
    REFRESH_TOKEN_TTL_DAYS: 1
  }
}))

const loadLocalUserPassControllerWithConfig = async (
  authConfigOverrides: Record<string, unknown>
) => {
  jest.resetModules()

  jest.doMock('../../../../constants', () => ({
    AUTH_CONFIG: {
      authCollection: 'auth_users',
      refreshTokensCollection: 'refresh_tokens',
      resetPasswordCollection: 'reset_password_requests',
      userCollection: 'users',
      user_id_field: 'id',
      authProviders: {
        'local-userpass': {
          disabled: false
        }
      },
      resetPasswordConfig: {
        runResetFunction: true,
        resetFunctionName: 'customReset'
      },
      ...authConfigOverrides
    },
    AUTH_DB_NAME: 'test-auth-db',
    DB_NAME: 'test-db',
    DEFAULT_CONFIG: {
      RESET_PASSWORD_TTL_SECONDS: 3600,
      AUTH_RATE_LIMIT_WINDOW_MS: 60000,
      AUTH_LOGIN_MAX_ATTEMPTS: 100,
      AUTH_REGISTER_MAX_ATTEMPTS: 100,
      AUTH_RESET_MAX_ATTEMPTS: 100,
      REFRESH_TOKEN_TTL_DAYS: 1
    }
  }))

  jest.doMock('../../../../state', () => ({
    StateManager: {
      select: jest.fn((key: string) => {
        if (key === 'functions') {
          return {
            customReset: {
              name: 'customReset',
              code: 'exports = async () => ({ status: "success" })'
            }
          }
        }

        if (key === 'services') {
          return {}
        }

        return {}
      })
    }
  }))

  jest.doMock('../../../../utils/context', () => ({
    GenerateContext: jest.fn()
  }))

  jest.doMock('../../../../utils/crypto', () => ({
    comparePassword: jest.fn(async () => true),
    generateToken: jest.fn(() => 'generated-token'),
    hashPassword: jest.fn(async (password: string) => `hashed:${password}`),
    hashToken: jest.fn(() => 'hashed-token')
  }))

  return import('../controller')
}

const buildLoginTestApp = ({
  authUser,
  customUser
}: {
  authUser: Record<string, unknown>
  customUser?: Record<string, unknown> | null
}) => {
  let loginHandler:
    | ((req: any, res: any) => Promise<unknown>)
    | undefined

  const authUsersCollection = {
    findOne: jest.fn().mockResolvedValue(authUser),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
  }

  const usersCollection = {
    findOne: jest.fn().mockResolvedValue(customUser ?? null)
  }

  const resetCollection = {
    createIndex: jest.fn().mockResolvedValue('ok'),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    findOne: jest.fn()
  }

  const refreshCollection = {
    createIndex: jest.fn().mockResolvedValue('ok'),
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'refresh-token-id' })
  }

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'auth_users') return authUsersCollection
      if (name === 'users') return usersCollection
      if (name === 'reset_password_requests') return resetCollection
      if (name === 'refresh_tokens') return refreshCollection
      return {}
    })
  }

  const app: any = {
    mongo: {
      client: {
        db: jest.fn().mockReturnValue(db)
      }
    },
    createAccessToken: jest.fn((user) => ({
      tokenType: 'access',
      user
    })),
    createRefreshToken: jest.fn(() => 'refresh-token')
  }

  app.post = jest.fn(
    (
      path: string,
      _opts: unknown,
      handler: (req: any, res: any) => Promise<unknown>
    ) => {
      if (path === '/login') {
        loginHandler = handler.bind(app)
      }
    }
  )

  return {
    app,
    usersCollection,
    authUsersCollection,
    refreshCollection,
    getLoginHandler: () => loginHandler
  }
}

jest.mock('../../../../state', () => ({
  StateManager: {
    select: jest.fn((key: string) => {
      if (key === 'functions') {
        return {
          customReset: { name: 'customReset', code: 'exports = async () => ({ status: "success" })' }
        }
      }
      if (key === 'services') {
        return {}
      }
      return {}
    })
  }
}))

jest.mock('../../../../utils/context', () => ({
  GenerateContext: jest.fn()
}))

jest.mock('../../../../utils/crypto', () => ({
  comparePassword: jest.fn(),
  generateToken: jest.fn(() => 'generated-token'),
  hashPassword: jest.fn(async (password: string) => `hashed:${password}`),
  hashToken: jest.fn(() => 'hashed-token')
}))

import { AUTH_ERRORS } from '../../../utils'
import { localUserPassController } from '../controller'
import { GenerateContext } from '../../../../utils/context'
import { hashPassword } from '../../../../utils/crypto'

describe('localUserPassController reset call', () => {
  const buildApp = () => {
    let resetCallHandler:
      | ((req: { body: { email: string; password: string; arguments?: unknown[] }; ip: string }, res: { status: jest.Mock }) => Promise<unknown>)
      | undefined

    const authUsersCollection = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'auth-user-1',
        email: 'john@doe.com',
        password: 'old-hash'
      }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true })
    }
    const resetCollection = {
      createIndex: jest.fn().mockResolvedValue('ok'),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOne: jest.fn()
    }
    const refreshCollection = {
      createIndex: jest.fn().mockResolvedValue('ok'),
      insertOne: jest.fn()
    }
    const usersCollection = {
      findOne: jest.fn()
    }
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'auth_users') return authUsersCollection
        if (name === 'reset_password_requests') return resetCollection
        if (name === 'refresh_tokens') return refreshCollection
        if (name === 'users') return usersCollection
        return {}
      })
    }
    const app = {
      mongo: { client: { db: jest.fn().mockReturnValue(db) } },
      post: jest.fn((path: string, _opts: unknown, handler: typeof resetCallHandler) => {
        if (path === '/reset/call') {
          resetCallHandler = handler
        }
      })
    }

    return { app, authUsersCollection, resetCollection, resetCallHandlerRef: () => resetCallHandler }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hashes and applies the password when the custom reset function returns success', async () => {
    ; (GenerateContext as jest.Mock).mockResolvedValue({ status: 'success' })
    const { app, authUsersCollection, resetCollection, resetCallHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }
    const result = await resetCallHandlerRef()?.(
      {
        body: { email: 'john@doe.com', password: 'new-secret', arguments: ['extra'] },
        ip: '127.0.0.1'
      },
      res
    )

    expect(GenerateContext).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        {
          token: 'generated-token',
          tokenId: 'generated-token',
          email: 'john@doe.com',
          password: 'new-secret',
          username: 'john@doe.com'
        },
        'extra'
      ],
      runAsSystem: true
    }))
    expect(hashPassword).toHaveBeenCalledWith('new-secret')
    expect(authUsersCollection.updateOne).toHaveBeenCalledWith(
      { email: 'john@doe.com' },
      { $set: { password: 'hashed:new-secret' } }
    )
    expect(resetCollection.deleteOne).toHaveBeenCalledWith({ email: 'john@doe.com' })
    expect(res.status).toHaveBeenCalledWith(202)
    expect(result).toEqual({ status: 'success' })
  })

  it('returns pending without changing the password when the custom reset function returns pending', async () => {
    ; (GenerateContext as jest.Mock).mockResolvedValue({ status: 'pending' })
    const { app, authUsersCollection, resetCollection, resetCallHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }
    const result = await resetCallHandlerRef()?.(
      {
        body: { email: 'john@doe.com', password: 'new-secret' },
        ip: '127.0.0.1'
      },
      res
    )

    expect(hashPassword).not.toHaveBeenCalled()
    expect(authUsersCollection.updateOne).not.toHaveBeenCalledWith(
      { email: 'john@doe.com' },
      expect.objectContaining({ $set: { password: expect.any(String) } })
    )
    expect(resetCollection.deleteOne).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(202)
    expect(result).toEqual({ status: 'pending' })
  })

  it('rejects the request when the custom reset function returns fail', async () => {
    ; (GenerateContext as jest.Mock).mockResolvedValue({ status: 'fail' })
    const { app, authUsersCollection, resetCollection, resetCallHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }

    await expect(
      resetCallHandlerRef()?.(
        {
          body: { email: 'john@doe.com', password: 'new-secret' },
          ip: '127.0.0.1'
        },
        res
      )
    ).rejects.toThrow(AUTH_ERRORS.INVALID_RESET_PARAMS)

    expect(hashPassword).not.toHaveBeenCalled()
    expect(authUsersCollection.updateOne).not.toHaveBeenCalled()
    expect(resetCollection.deleteOne).not.toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('uses linked custom user collection as custom_data on login when custom user data is enabled', async () => {
    const authUserId = '697349de5dc2c5850198cc06'

    const { localUserPassController } =
      await loadLocalUserPassControllerWithConfig({
        userCollection: 'users',
        user_id_field: 'id'
      })

    const { app, usersCollection, getLoginHandler } = buildLoginTestApp({
      authUser: {
        _id: { toString: () => authUserId },
        email: 'enabled-login@example.com',
        password: 'hashed-password',
        status: 'confirmed',
        custom_data: {
          role: 'from-auth-users'
        }
      },
      customUser: {
        id: authUserId,
        role: 'from-users-collection',
        tenantId: 'tenant-linked'
      }
    })

    await localUserPassController(app as never)

    const result = await getLoginHandler()?.(
      {
        ip: '127.0.0.1',
        body: {
          username: 'enabled-login@example.com',
          password: 'secret'
        }
      },
      {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      }
    )

    expect(usersCollection.findOne).toHaveBeenCalledWith({
      id: authUserId
    })

    expect(app.createAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_data: {
          id: authUserId,
          role: 'from-users-collection',
          tenantId: 'tenant-linked'
        }
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        access_token: {
          tokenType: 'access',
          user: expect.objectContaining({
            custom_data: {
              id: authUserId,
              role: 'from-users-collection',
              tenantId: 'tenant-linked'
            }
          })
        },
        refresh_token: 'refresh-token',
        user_id: authUserId
      })
    )
  })

  it('uses auth_users.custom_data on login when custom user data is disabled', async () => {
    const authUserId = '697349de5dc2c5850198cc06'

    const { localUserPassController } =
      await loadLocalUserPassControllerWithConfig({
        userCollection: undefined,
        user_id_field: undefined
      })

    const { app, usersCollection, getLoginHandler } = buildLoginTestApp({
      authUser: {
        _id: { toString: () => authUserId },
        email: 'disabled-login@example.com',
        password: 'hashed-password',
        status: 'confirmed',
        custom_data: {
          role: 'student',
          tenantId: 'tenant-from-auth-users',
          tryingToAddCustomData: true
        }
      },
      customUser: {
        id: authUserId,
        role: 'this-should-not-be-used'
      }
    })

    await localUserPassController(app as never)

    const result = await getLoginHandler()?.(
      {
        ip: '127.0.0.1',
        body: {
          username: 'disabled-login@example.com',
          password: 'secret'
        }
      },
      {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      }
    )

    expect(usersCollection.findOne).not.toHaveBeenCalled()

    expect(app.createAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_data: {
          role: 'student',
          tenantId: 'tenant-from-auth-users',
          tryingToAddCustomData: true
        }
      })
    )

    expect(result).toEqual(
      expect.objectContaining({
        access_token: {
          tokenType: 'access',
          user: expect.objectContaining({
            custom_data: {
              role: 'student',
              tenantId: 'tenant-from-auth-users',
              tryingToAddCustomData: true
            }
          })
        },
        refresh_token: 'refresh-token',
        user_id: authUserId
      })
    )
  })
})
