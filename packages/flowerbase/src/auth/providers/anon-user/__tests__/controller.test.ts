import { PROVIDER } from '../../../../shared/models/handleUserRegistration.model'

jest.mock('../../../../constants', () => ({
  AUTH_CONFIG: {
    authCollection: 'auth_users',
    refreshTokensCollection: 'refresh_tokens',
    authProviders: {
      'anon-user': { disabled: false }
    },
    providers: {
      'anon-user': { disabled: false }
    }
  },
  DB_NAME: 'test-db',
  DEFAULT_CONFIG: {
    REFRESH_TOKEN_TTL_DAYS: 1,
    ANON_USER_TTL_SECONDS: 3600
  }
}))

describe('anonUserController', () => {
  it('inserts anon users with a generated email', async () => {
    const { anonUserController } = await import('../controller')
    let insertedDoc: Record<string, unknown> | undefined
    const authCollection = {
      createIndex: jest.fn().mockResolvedValue('ok'),
      insertOne: jest.fn(async (doc: Record<string, unknown>) => {
        insertedDoc = doc
        return { insertedId: doc._id }
      })
    }
    const refreshCollection = {
      insertOne: jest.fn().mockResolvedValue({})
    }
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'auth_users') {
          return authCollection
        }
        if (name === 'refresh_tokens') {
          return refreshCollection
        }
        return authCollection
      })
    }

    let loginHandler: ((...args: unknown[]) => unknown) | undefined
    const app = {
      mongo: { client: { db: jest.fn().mockReturnValue(db) } },
      post: jest.fn((path: string, _opts: unknown, handler: (...args: unknown[]) => unknown) => {
        loginHandler = handler
      })
    }

    await anonUserController(app as unknown as never)

    const context = {
      createRefreshToken: jest.fn(() => 'refresh'),
      createAccessToken: jest.fn(() => 'access')
    }

    await (loginHandler as (...args: unknown[]) => Promise<unknown>).call(context, {})

    const doc = insertedDoc as {
      _id: { toString: () => string }
      email: string
      identities: Array<{
        id?: string
        provider_id?: string
        provider_type?: string
        provider_data?: Record<string, unknown>
      }>
    }

    expect(doc.email).toBe(`anon-${doc._id.toString()}@users.invalid`)
    expect(doc.identities[0]).toEqual(
      expect.objectContaining({
        id: doc._id.toString(),
        provider_id: doc._id.toString(),
        provider_type: PROVIDER.ANON_USER,
        provider_data: {}
      })
    )
  })
})
