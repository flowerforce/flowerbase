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
    },
    localUserpassConfig: {
      autoConfirm: false,
      runConfirmationFunction: true,
      confirmationFunctionName: 'customConfirm'
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

jest.mock('../../../../state', () => ({
  StateManager: {
    select: jest.fn((key: string) => {
      if (key === 'functions') {
        return {
          customReset: { name: 'customReset', code: 'exports = async () => ({ status: "success" })' },
          customConfirm: { name: 'customConfirm', code: 'exports = async () => ({ status: "pending" })' }
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
    const routeHandlers: Record<string, ((req: { body: any; ip: string }, res: { status: jest.Mock; send?: jest.Mock }) => Promise<unknown>) | undefined> = {}

    const authUsersCollection = {
      findOne: jest.fn().mockResolvedValue({
        _id: 'auth-user-1',
        email: 'john@doe.com',
        password: 'old-hash',
        status: 'pending'
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
      post: jest.fn((path: string, _opts: unknown, handler: (req: { body: any; ip: string }, res: { status: jest.Mock; send?: jest.Mock }) => Promise<unknown>) => {
        routeHandlers[path] = handler
      })
    }

    return {
      app,
      authUsersCollection,
      resetCollection,
      routeHandlerRef: (path: string) => routeHandlers[path]
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('hashes and applies the password when the custom reset function returns success', async () => {
    ; (GenerateContext as jest.Mock).mockResolvedValue({ status: 'success' })
    const { app, authUsersCollection, resetCollection, routeHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }
    const result = await routeHandlerRef('/reset/call')?.(
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
    const { app, authUsersCollection, resetCollection, routeHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }
    const result = await routeHandlerRef('/reset/call')?.(
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
    const { app, authUsersCollection, resetCollection, routeHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }

    await expect(
      routeHandlerRef('/reset/call')?.(
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

  it('resends the confirmation email for local-userpass users', async () => {
    ; (GenerateContext as jest.Mock).mockResolvedValue({ status: 'pending' })
    const { app, authUsersCollection, routeHandlerRef } = buildApp()

    await localUserPassController(app as never)

    const res = { status: jest.fn() }
    const result = await routeHandlerRef('/confirm/send')?.(
      {
        body: { email: 'John@Doe.com' },
        ip: '127.0.0.1'
      },
      res
    )

    expect(GenerateContext).toHaveBeenCalledWith(expect.objectContaining({
      args: [
        {
          token: 'generated-token',
          tokenId: 'generated-token',
          username: 'john@doe.com'
        }
      ],
      functionName: 'customConfirm',
      runAsSystem: true
    }))
    expect(authUsersCollection.updateOne).toHaveBeenCalledWith(
      { email: 'john@doe.com' },
      {
        $set: {
          status: 'pending',
          confirmationToken: 'generated-token',
          confirmationTokenId: 'generated-token'
        }
      }
    )
    expect(res.status).toHaveBeenCalledWith(202)
    expect(result).toEqual({ status: 'ok' })
  })
})
