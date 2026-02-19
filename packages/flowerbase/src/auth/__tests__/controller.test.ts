import { authController } from '../controller'

jest.mock('../../constants', () => ({
  AUTH_CONFIG: {
    authCollection: 'auth_users',
    refreshTokensCollection: 'refresh_tokens',
    userCollection: 'users',
    user_id_field: 'id'
  },
  DB_NAME: 'test-db',
  DEFAULT_CONFIG: {
    REFRESH_TOKEN_TTL_DAYS: 1
  }
}))

describe('authController', () => {
  it('creates a unique email index on the auth collection', async () => {
    const authCollection = {
      createIndex: jest.fn().mockResolvedValue('ok')
    }
    const refreshCollection = {
      createIndex: jest.fn().mockResolvedValue('ok')
    }
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'auth_users') {
          return authCollection
        }
        if (name === 'refresh_tokens') {
          return refreshCollection
        }
        return { createIndex: jest.fn().mockResolvedValue('ok') }
      })
    }
    const app = {
      mongo: { client: { db: jest.fn().mockReturnValue(db) } },
      addHook: jest.fn(),
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn(),
      jwtAuthentication: jest.fn()
    }

    await authController(app as unknown as never)

    expect(authCollection.createIndex).toHaveBeenCalledWith(
      { email: 1 },
      { unique: true }
    )
  })

  it('returns Realm-like profile payload with linked custom_data', async () => {
    const authUserId = '697349de5dc2c5850198cc06'
    let profileHandler: ((req: any) => Promise<unknown>) | undefined
    const authCollection = {
      createIndex: jest.fn().mockResolvedValue('ok'),
      findOne: jest.fn().mockResolvedValue({
        _id: { toString: () => authUserId },
        email: 'jessica.lussu@stackhouse.it',
        identities: [{ provider_type: 'local-userpass' }]
      })
    }
    const usersCollection = {
      findOne: jest.fn().mockResolvedValue({
        _id: '6075cb8840ceb66546e9aaeb',
        userId: authUserId,
        name: 'Jessica Lussu'
      })
    }
    const refreshCollection = {
      createIndex: jest.fn().mockResolvedValue('ok')
    }
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'auth_users') return authCollection
        if (name === 'users') return usersCollection
        if (name === 'refresh_tokens') return refreshCollection
        return { createIndex: jest.fn().mockResolvedValue('ok') }
      })
    }
    const app = {
      mongo: { client: { db: jest.fn().mockReturnValue(db) } },
      addHook: jest.fn(),
      get: jest.fn((path: string, _opts: unknown, handler: (req: any) => Promise<unknown>) => {
        if (path === '/profile') {
          profileHandler = handler
        }
      }),
      post: jest.fn(),
      delete: jest.fn(),
      jwtAuthentication: jest.fn()
    }

    await authController(app as unknown as never)
    const result = await profileHandler?.({
      user: { typ: 'access', id: authUserId },
      params: { appId: 'flowerbase-e2e' }
    })

    expect(result).toEqual({
      user_id: authUserId,
      domain_id: 'flowerbase-e2e',
      identities: [{ provider_type: 'local-userpass' }],
      custom_data: {
        _id: '6075cb8840ceb66546e9aaeb',
        userId: authUserId,
        name: 'Jessica Lussu'
      },
      type: 'normal',
      data: {
        email: 'jessica.lussu@stackhouse.it'
      }
    })
  })
})
