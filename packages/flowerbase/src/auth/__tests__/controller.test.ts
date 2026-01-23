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
})
