import { authController } from '../controller'

jest.mock('../../constants', () => ({
  AUTH_CONFIG: {
    authCollection: 'auth_users',
    refreshTokensCollection: 'refresh_tokens',
    userCollection: 'users',
    user_id_field: 'id'
  },
  AUTH_DB_NAME: 'test-auth-db',
  DB_NAME: 'test-db',
  DEFAULT_CONFIG: {
    REFRESH_TOKEN_TTL_DAYS: 1
  }
}))

const loadAuthControllerWithConfig = async (
  authConfigOverrides: Record<string, unknown>
) => {
  jest.resetModules()

  jest.doMock('../../constants', () => ({
    AUTH_CONFIG: {
      authCollection: 'auth_users',
      refreshTokensCollection: 'refresh_tokens',
      userCollection: 'users',
      user_id_field: 'id',
      ...authConfigOverrides
    },
    AUTH_DB_NAME: 'test-auth-db',
    DB_NAME: 'test-db',
    DEFAULT_CONFIG: {
      REFRESH_TOKEN_TTL_DAYS: 1
    }
  }))

  jest.doMock('../../state', () => ({
    StateManager: {
      select: jest.fn((key: string) => {
        if (key === 'projectId') return 'test-project'
        return undefined
      })
    }
  }))

  return import('../controller')
}

const buildProfileTestApp = ({
  authUser,
  customUser
}: {
  authUser: Record<string, unknown>
  customUser?: Record<string, unknown> | null
}) => {
  let profileHandler: ((req: any) => Promise<unknown>) | undefined

  const authCollection = {
    createIndex: jest.fn().mockResolvedValue('ok'),
    findOne: jest.fn().mockResolvedValue(authUser)
  }

  const refreshCollection = {
    createIndex: jest.fn().mockResolvedValue('ok')
  }

  const usersCollection = {
    findOne: jest.fn().mockResolvedValue(customUser ?? null)
  }

  const db = {
    collection: jest.fn((name: string) => {
      if (name === 'auth_users') return authCollection
      if (name === 'refresh_tokens') return refreshCollection
      if (name === 'users') return usersCollection
      return {
        createIndex: jest.fn().mockResolvedValue('ok'),
        findOne: jest.fn().mockResolvedValue(null)
      }
    })
  }

  const app = {
    mongo: {
      client: {
        db: jest.fn().mockReturnValue(db)
      }
    },
    addHook: jest.fn(),
    get: jest.fn(
      (
        path: string,
        _opts: unknown,
        handler: (req: any) => Promise<unknown>
      ) => {
        if (path === '/profile') {
          profileHandler = handler
        }
      }
    ),
    post: jest.fn(),
    delete: jest.fn(),
    jwtAuthentication: jest.fn()
  }

  return {
    app,
    usersCollection,
    getProfileHandler: () => profileHandler
  }
}

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

  it('returns custom_data from linked custom user collection when custom user data is enabled', async () => {
    const authUserId = '697349de5dc2c5850198cc06'

    const { authController } = await loadAuthControllerWithConfig({
      userCollection: 'users',
      user_id_field: 'id'
    })

    const { app, usersCollection, getProfileHandler } = buildProfileTestApp({
      authUser: {
        _id: { toString: () => authUserId },
        email: 'enabled@example.com',
        identities: [{ provider_type: 'local-userpass' }],
        custom_data: {
          role: 'from-auth-users'
        }
      },
      customUser: {
        _id: 'custom-user-document-id',
        id: authUserId,
        name: 'Mario Rossi',
        role: 'from-users-collection'
      }
    })

    await authController(app as never)

    const result = await getProfileHandler()?.({
      user: {
        typ: 'access',
        id: authUserId
      },
      params: {
        appId: 'flowerbase-e2e'
      }
    })

    expect(usersCollection.findOne).toHaveBeenCalledWith({
      id: authUserId
    })

    expect(result).toEqual({
      user_id: authUserId,
      domain_id: 'flowerbase-e2e',
      identities: [{ provider_type: 'local-userpass' }],
      custom_data: {
        _id: 'custom-user-document-id',
        id: authUserId,
        name: 'Mario Rossi',
        role: 'from-users-collection'
      },
      type: 'normal',
      data: {
        email: 'enabled@example.com'
      }
    })
  })

  it('returns auth_users.custom_data when custom user data is disabled', async () => {
    const authUserId = '697349de5dc2c5850198cc06'

    const { authController } = await loadAuthControllerWithConfig({
      userCollection: undefined,
      user_id_field: undefined
    })

    const { app, usersCollection, getProfileHandler } = buildProfileTestApp({
      authUser: {
        _id: { toString: () => authUserId },
        email: 'disabled@example.com',
        identities: [{ provider_type: 'local-userpass' }],
        custom_data: {
          role: 'student',
          tenantId: 'tenant-1',
          tryingToAddCustomData: true
        }
      },
      customUser: {
        id: authUserId,
        role: 'this-should-not-be-used'
      }
    })

    await authController(app as never)

    const result = await getProfileHandler()?.({
      user: {
        typ: 'access',
        id: authUserId
      },
      params: {
        appId: 'flowerbase-e2e'
      }
    })

    expect(usersCollection.findOne).not.toHaveBeenCalled()

    expect(result).toEqual({
      user_id: authUserId,
      domain_id: 'flowerbase-e2e',
      identities: [{ provider_type: 'local-userpass' }],
      custom_data: {
        role: 'student',
        tenantId: 'tenant-1',
        tryingToAddCustomData: true
      },
      type: 'normal',
      data: {
        email: 'disabled@example.com'
      }
    })
  })
})
