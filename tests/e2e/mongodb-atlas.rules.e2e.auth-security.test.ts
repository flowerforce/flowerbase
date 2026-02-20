import path from 'node:path'
import { EJSON } from 'bson'
import { FastifyInstance } from 'fastify'
import { Document, MongoClient, ObjectId } from 'mongodb'
import type { User } from '../../packages/flowerbase/src/auth/dtos'
import { API_VERSION, AUTH_CONFIG, DEFAULT_CONFIG } from '../../packages/flowerbase/src/constants'
import { hashPassword, hashToken } from '../../packages/flowerbase/src/utils/crypto'
import { registerMongoAtlasE2eSetup } from './mongodb-atlas.rules.e2e.setup'

jest.setTimeout(120000)

const APP_ROOT = path.join(__dirname, 'app')
const DB_NAME = 'flowerbase-e2e'
const TODO_COLLECTION = 'todos'
const USER_COLLECTION = 'users'
const ACTIVITIES_COLLECTION = 'activities'
const COUNTERS_COLLECTION = 'counters'
const UPLOADS_COLLECTION = 'uploads'
const TRIGGER_ITEMS_INSERT_COLLECTION = 'trigger_items_insert'
const TRIGGER_ITEMS_UPDATE_COLLECTION = 'trigger_items_update'
const TRIGGER_ITEMS_DELETE_COLLECTION = 'trigger_items_delete'
const FILTERED_TRIGGER_ITEMS_COLLECTION = 'trigger_items_filtered'
const AUTH_USERS_COLLECTION = 'auth_users'
const RESET_PASSWORD_COLLECTION = 'reset_password_requests'
const FILTERED_TRIGGER_EVENTS_COLLECTION = 'filteredTriggerEvents'
const FILTERED_UPDATE_TRIGGER_EVENTS_COLLECTION = 'filteredUpdateTriggerEvents'
const MANAGE_REPLICA_SET = process.env.MANAGE_REPLICA_SET === 'true'
const REPLICA_SET_NAME = process.env.REPLICA_SET_NAME ?? 'rs0'
const REPLICA_SET_HOST = process.env.REPLICA_SET_HOST ?? 'mongo:27017'
const DEFAULT_DB_URL = 'mongodb://localhost:27017'
const resolveMongoUrl = () => {
  const value = process.env.DB_CONNECTION_STRING?.trim()
  return value && value.length > 0 ? value : DEFAULT_DB_URL
}

type TestUser = User & {
  id: string
  role?: string
  email: string
  custom_data?: {
    key?: string
    workspaces: string[]
    adminIn?: string[]
  }
}


const todoIds = {
  ownerFirst: new ObjectId('000000000000000000000001'),
  ownerSecond: new ObjectId('000000000000000000000002'),
  otherUser: new ObjectId('000000000000000000000003')
}

const userIds = {
  owner: new ObjectId('000000000000000000000010'),
  guest: new ObjectId('000000000000000000000011')
}

const projectIds = {
  ownerProject: new ObjectId('000000000000000000000020'),
  guestProject: new ObjectId('000000000000000000000021')
}

const logIds = {
  activeOwner: new ObjectId('000000000000000000000030'),
  inactiveOwner: new ObjectId('000000000000000000000031'),
  activeGuest: new ObjectId('000000000000000000000032')
}

const activityIds = {
  ownerPrivate: new ObjectId('000000000000000000000101'),
  ownerPublic: new ObjectId('000000000000000000000102'),
  guestPublic: new ObjectId('000000000000000000000103')
}

const counterIds = {
  ownerOnly: new ObjectId('000000000000000000000201'),
  workspaceAll: new ObjectId('000000000000000000000202'),
  visibilityUsers: new ObjectId('000000000000000000000203'),
  adminOnly: new ObjectId('000000000000000000000204')
}
const uploadIds = {
  owner: new ObjectId('000000000000000000000301'),
  guest: new ObjectId('000000000000000000000302')
}
const authUserIds = {
  owner: new ObjectId('000000000000000000000090'),
  guest: new ObjectId('000000000000000000000091'),
  admin: new ObjectId('000000000000000000000092')
}
const ownerUser: TestUser = {
  id: authUserIds.owner.toString(),
  email: 'owner@example.com',
  role: 'owner',
  custom_data: {
    role: 'owner',
    key: 'publisher-owner',
    workspaces: ['workspace-1'],
    adminIn: ['workspace-1']
  }
} as TestUser
const guestUser: TestUser = {
  id: authUserIds.guest.toString(),
  email: 'guest@example.com',
  role: 'guest',
  custom_data: {
    role: 'guest',
    key: 'publisher-guest',
    workspaces: ['workspace-2'],
    adminIn: []
  }
} as TestUser
const adminUser: TestUser = {
  id: authUserIds.admin.toString(),
  email: 'admin@example.com',
  role: 'admin',
  custom_data: {
    role: 'admin',
    key: 'publisher-admin',
    workspaces: ['workspace-1', 'workspace-2'],
    adminIn: ['workspace-1', 'workspace-2']
  }
} as TestUser
const TRIGGER_EVENTS_COLLECTION = 'triggerEvents'
const PROVIDER_TRIGGER_EVENTS_COLLECTION = 'providerTriggerEvents'
const PROJECT_ID = 'flowerbase-e2e'
const FUNCTION_CALL_URL = `${API_VERSION}/app/${PROJECT_ID}/functions/call`
const AUTH_BASE_URL = `${API_VERSION}/app/${PROJECT_ID}/auth/providers/local-userpass`
const ANON_AUTH_BASE_URL = `${API_VERSION}/app/${PROJECT_ID}/auth/providers/anon-user`
const CUSTOM_FUNCTION_AUTH_BASE_URL = `${API_VERSION}/app/${PROJECT_ID}/auth/providers/custom-function`
const TOKEN_MAP: Record<string, string> = {}

const serializeValue = (value: unknown) => {
  if (value === undefined) return undefined
  const serialized = EJSON.stringify(value)
  try {
    return JSON.parse(serialized)
  } catch {
    return serialized
  }
}

const getTokenFor = (user: TestUser | null) => {
  if (!user) return undefined
  return TOKEN_MAP[user.id]
}

const callServiceOperation = async ({
  collection,
  method,
  user,
  query,
  filter,
  update,
  projection,
  document,
  pipeline,
  options
}: {
  collection: string
  method:
  | 'find'
  | 'findOne'
  | 'count'
  | 'countDocuments'
  | 'findOneAndUpdate'
  | 'deleteOne'
  | 'deleteMany'
  | 'insertOne'
  | 'updateOne'
  | 'aggregate'
  user: TestUser | null
  query?: Document
  filter?: Document
  update?: Document
  projection?: Document
  document?: Document
  options?: Document
  pipeline?: Document[]
}) => {
  const fastify = appInstance
  if (!fastify) {
    throw new Error('App instance not initialized')
  }

  const payload = {
    name: method,
    arguments: [
      {
        database: DB_NAME,
        collection,
        query: serializeValue(query),
        filter: serializeValue(filter),
        update: serializeValue(update),
        projection: serializeValue(projection),
        document: serializeValue(document),
        pipeline: pipeline?.map((stage) => serializeValue(stage)),
        options: serializeValue(options)
      }
    ],
    service: 'mongodb-atlas'
  }

  const headers: Record<string, string> = {}
  const token = getTokenFor(user)
  if (!token && user) {
    throw new Error(`Missing token for ${user.id}`)
  }
  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  const response = await fastify.inject({
    method: 'POST',
    url: FUNCTION_CALL_URL,
    headers,
    payload
  })

  if (response.statusCode >= 400) {
    const body = response.json()
    const message = body && typeof body === 'object' && 'message' in body ? (body as { message?: string }).message : undefined
    throw new Error(message ?? response.payload ?? 'failed to execute service operation')
  }

  return EJSON.deserialize(response.json())
}

const createCollectionProxy = (collection: string, user: TestUser | null) => ({
  find: (query: Document = {}, projection?: Document, options?: Document) => ({
    toArray: async () =>
      callServiceOperation({ collection, method: 'find', user, query, projection, options })
  }),
  aggregate: (pipeline: Document[] = []) => ({
    toArray: async () => callServiceOperation({ collection, method: 'aggregate', user, pipeline })
  }),
  findOne: (query: Document = {}, projection?: Document, options?: Document) =>
    callServiceOperation({ collection, method: 'findOne', user, query, projection, options }),
  count: (query: Document = {}, options?: Document) =>
    callServiceOperation({ collection, method: 'count', user, query, options }),
  countDocuments: (query: Document = {}, options?: Document) =>
    callServiceOperation({ collection, method: 'countDocuments', user, query, options }),
  insertOne: (document: Document) => callServiceOperation({ collection, method: 'insertOne', user, document }),
  updateOne: (query: Document, update: Document) =>
    callServiceOperation({ collection, method: 'updateOne', user, query, update }),
  findOneAndUpdate: (query: Document, update: Document) =>
    callServiceOperation({ collection, method: 'findOneAndUpdate', user, query, update }),
  deleteOne: (query: Document, options?: Document) =>
    callServiceOperation({ collection, method: 'deleteOne', user, query, options }),
  deleteMany: (query: Document = {}, options?: Document) =>
    callServiceOperation({ collection, method: 'deleteMany', user, query, options }),
})

const getTodosCollection = (user: TestUser | null) => createCollectionProxy(TODO_COLLECTION, user)
const getAuthUsersCollection = (user: TestUser | null) => createCollectionProxy(AUTH_USERS_COLLECTION, user)

const registerAccessToken = (user: TestUser, authId: ObjectId) => {
  if (!appInstance) {
    throw new Error('App instance not initialized')
  }

  const customData = user.custom_data ?? {}
  const userData = {
    _id: authId,
    id: authId.toString(),
    email: user.email,
    role: user.role,
    custom_data: customData,
    ...customData
  }

  const payload = {
    _id: authId,
    email: user.email,
    user_data: userData
  } as Parameters<NonNullable<typeof appInstance>['createAccessToken']>[0]
  const token = appInstance.createAccessToken(payload)

  TOKEN_MAP[user.id] = token
}

type ProjectDoc = Document & {
  ownerId: string
  summary: string
  secretNotes?: string
  internalCode?: string
}

let client: MongoClient
let appInstance: FastifyInstance | undefined
let originalMainPath: string | undefined

const resetCollections = async () => {
  const db = client.db(DB_NAME)
  await Promise.all([
    db.collection(TODO_COLLECTION).deleteMany({}),
    db.collection(USER_COLLECTION).deleteMany({}),
    db.collection('projects').deleteMany({}),
    db.collection('activityLogs').deleteMany({}),
    db.collection(ACTIVITIES_COLLECTION).deleteMany({}),
    db.collection(COUNTERS_COLLECTION).deleteMany({}),
    db.collection(UPLOADS_COLLECTION).deleteMany({}),
    db.collection(AUTH_USERS_COLLECTION).deleteMany({}),
    db.collection(AUTH_CONFIG.refreshTokensCollection).deleteMany({}),
    db.collection(RESET_PASSWORD_COLLECTION).deleteMany({}),
    db.collection(TRIGGER_ITEMS_INSERT_COLLECTION).deleteMany({}),
    db.collection(TRIGGER_ITEMS_UPDATE_COLLECTION).deleteMany({}),
    db.collection(TRIGGER_ITEMS_DELETE_COLLECTION).deleteMany({}),
    db.collection(FILTERED_TRIGGER_ITEMS_COLLECTION).deleteMany({}),
    db.collection(TRIGGER_EVENTS_COLLECTION).deleteMany({}),
    db.collection(PROVIDER_TRIGGER_EVENTS_COLLECTION).deleteMany({}),
    db.collection(FILTERED_TRIGGER_EVENTS_COLLECTION).deleteMany({}),
    db.collection(FILTERED_UPDATE_TRIGGER_EVENTS_COLLECTION).deleteMany({})
  ])

  await db.collection(TODO_COLLECTION).insertMany([
    { _id: todoIds.ownerFirst, title: 'Owner task 1', userId: ownerUser.id, sensitive: 'redacted' },
    { _id: todoIds.ownerSecond, title: 'Owner task 2', userId: ownerUser.id, sensitive: 'redacted' },
    { _id: todoIds.otherUser, title: 'Other user task', userId: guestUser.id, sensitive: 'redacted' }
  ])

  await db.collection(USER_COLLECTION).insertMany([
    {
      _id: userIds.owner,
      userId: ownerUser.id,
      id: authUserIds.owner.toString(),
      email: 'owner@example.com',
      password: 'top-secret',
      workspaces: ['workspace-1'],
      avatar: 'owner.png',
      name: 'Owner name',
      tags: ['owner'],
      updatedAt: new Date()
    },
    {
      _id: userIds.guest,
      userId: guestUser.id,
      id: authUserIds.guest.toString(),
      email: 'guest@example.com',
      password: 'safe-secret',
      workspaces: ['workspace-2'],
      avatar: 'guest.png',
      name: 'Guest name',
      tags: ['guest'],
      updatedAt: new Date()
    }
  ])

  await db.collection('projects').insertMany([
    {
      _id: projectIds.ownerProject,
      ownerId: ownerUser.id,
      name: 'Owner project',
      summary: 'Owner summary',
      secretNotes: 'top secret',
      internalCode: 'XYZ123'
    },
    {
      _id: projectIds.guestProject,
      ownerId: guestUser.id,
      name: 'Guest project',
      summary: 'Guest summary',
      secretNotes: 'guest secret',
      internalCode: 'ABC987'
    }
  ])

  await db.collection('activityLogs').insertMany([
    {
      _id: logIds.activeOwner,
      message: 'Owner active log',
      status: 'active',
      ownerId: ownerUser.id
    },
    {
      _id: logIds.inactiveOwner,
      message: 'Owner inactive log',
      status: 'inactive',
      ownerId: ownerUser.id
    },
    {
      _id: logIds.activeGuest,
      message: 'Guest active log',
      status: 'active',
      ownerId: guestUser.id
    }
  ])

  await db.collection(ACTIVITIES_COLLECTION).insertMany([
    {
      _id: activityIds.ownerPrivate,
      title: 'Private owner activity',
      ownerId: ownerUser.id,
      workspace: 'workspace-1',
      visibility: {
        type: 'onlyme'
      }
    },
    {
      _id: activityIds.ownerPublic,
      title: 'Shared activity',
      ownerId: 'user-three',
      workspace: 'workspace-1',
      visibility: {
        type: 'team'
      }
    },
    {
      _id: activityIds.guestPublic,
      title: 'Guest workspace activity',
      ownerId: guestUser.id,
      workspace: 'workspace-2',
      visibility: {
        type: 'group'
      }
    }
  ])

  await db.collection(COUNTERS_COLLECTION).insertMany([
    {
      _id: counterIds.ownerOnly,
      ownerId: ownerUser.id,
      workspace: 'workspace-1',
      value: 100,
      visibility: {
        type: 'onlyme'
      }
    },
    {
      _id: counterIds.workspaceAll,
      ownerId: 'user-three',
      workspace: 'workspace-1',
      value: 200,
      visibility: {
        type: 'all'
      }
    },
    {
      _id: counterIds.visibilityUsers,
      ownerId: 'user-four',
      workspace: 'workspace-2',
      value: 300,
      visibility: {
        type: 'private',
        users: [guestUser.id]
      }
    },
    {
      _id: counterIds.adminOnly,
      ownerId: 'user-five',
      workspace: 'workspace-1',
      value: 400,
      visibility: {
        type: 'private'
      }
    }
  ])

  await db.collection(UPLOADS_COLLECTION).insertMany([
    {
      _id: uploadIds.owner,
      publisher: ownerUser.custom_data?.key,
      status: 'pending'
    },
    {
      _id: uploadIds.guest,
      publisher: guestUser.custom_data?.key,
      status: 'pending'
    }
  ])

  const [ownerPassword, guestPassword, adminPassword] = await Promise.all([
    hashPassword('top-secret'),
    hashPassword('safe-secret'),
    hashPassword('admin-secret')
  ])

  await db.collection(AUTH_USERS_COLLECTION).insertMany([
    {
      _id: authUserIds.owner,
      email: 'auth-owner@example.com',
      password: ownerPassword,
      status: 'confirmed',
      createdAt: new Date(),
      userId: ownerUser.id
    },
    {
      _id: authUserIds.guest,
      email: 'auth-guest@example.com',
      password: guestPassword,
      status: 'confirmed',
      createdAt: new Date(),
      userId: guestUser.id
    },
    {
      _id: authUserIds.admin,
      email: 'auth-admin@example.com',
      password: adminPassword,
      status: 'confirmed',
      createdAt: new Date(),
      userId: adminUser.id
    }
  ])
}

const ensureFilteredTriggerCollections = async () => {
  const db = client.db(DB_NAME)

  const recreateCollection = async (name: string, options?: Parameters<typeof db.createCollection>[1]) => {
    try {
      await db.collection(name).drop()
    } catch {
      // ignore if collection does not exist
    }

    await db.createCollection(name, options)
  }

  await recreateCollection(FILTERED_TRIGGER_EVENTS_COLLECTION)
    await recreateCollection(FILTERED_UPDATE_TRIGGER_EVENTS_COLLECTION)
    await recreateCollection(FILTERED_TRIGGER_ITEMS_COLLECTION, {
    changeStreamPreAndPostImages: { enabled: true }
  })
}

const dropReplicaSetHint = (mongoUrl: string) => {
  try {
    const url = new URL(mongoUrl)
    url.searchParams.delete('replicaSet')
    const normalized = url.toString()
    return normalized.endsWith('?') ? normalized.slice(0, -1) : normalized
  } catch {
    return mongoUrl.split('?')[0]
  }
}

const cloneAuthProviders = () =>
  JSON.parse(JSON.stringify(AUTH_CONFIG.authProviders ?? {})) as Record<string, unknown>

const withAuthProviders = async (nextProviders: Record<string, unknown>, fn: () => Promise<void>) => {
  const originalProviders = cloneAuthProviders()
  AUTH_CONFIG.authProviders = nextProviders as typeof AUTH_CONFIG.authProviders
  try {
    await fn()
  } finally {
    AUTH_CONFIG.authProviders = originalProviders as typeof AUTH_CONFIG.authProviders
  }
}

const withoutProvider = (providerName: string) => {
  const next = cloneAuthProviders()
  delete (next as Record<string, unknown>)[providerName]
  return next
}

const withDisabledProvider = (providerName: string) => {
  const next = cloneAuthProviders()
  const existing = (next as Record<string, unknown>)[providerName]
  if (existing && typeof existing === 'object') {
    (existing as { disabled?: boolean }).disabled = true
  } else {
    (next as Record<string, unknown>)[providerName] = {
      name: providerName,
      type: providerName,
      disabled: true
    }
  }
  return next
}

const isReplicaSetNotInitializedError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }
  const message = error.message.toLowerCase()
  return (
    message.includes('not yet initialized') ||
    message.includes('no replset config has been received') ||
    message.includes('no host described in new configuration') ||
    message.includes('not yet a member of a replset') ||
    message.includes('replset not yet initialized') ||
    ('code' in error && (error as { code?: number }).code === 94) ||
    ('codeName' in error && (error as { codeName?: string }).codeName === 'NotYetInitialized')
  )
}

const ensureReplicaSet = async (client: MongoClient) => {
  const adminDb = client.db('admin')
  let initiated = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const status = await adminDb.command({ replSetGetStatus: 1 })
      if (status.members?.some((member: { stateStr: string }) => member.stateStr === 'PRIMARY')) {
        return
      }
    } catch (error) {
      if (!initiated && isReplicaSetNotInitializedError(error)) {
        await adminDb.command({
          replSetInitiate: {
            _id: REPLICA_SET_NAME,
            members: [{ _id: 0, host: REPLICA_SET_HOST }]
          }
        })
        initiated = true
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  throw new Error('Replica set did not reach PRIMARY in time')
}

describe('MongoDB Atlas rule enforcement (e2e)', () => {
  registerMongoAtlasE2eSetup({
    DB_NAME,
    AUTH_USERS_COLLECTION,
    APP_ROOT,
    MANAGE_REPLICA_SET,
    resolveMongoUrl,
    dropReplicaSetHint,
    ensureReplicaSet,
    ensureFilteredTriggerCollections,
    registerAccessToken,
    ownerUser,
    guestUser,
    adminUser,
    authUserIds,
    getClient: () => client,
    setClient: (value) => {
      client = value
    },
    setAppInstance: (value) => {
      appInstance = value
    },
    setOriginalMainPath: (value) => {
      originalMainPath = value
    },
    onBeforeEach: resetCollections
  })

  it('rejects local-userpass registration when provider is missing', async () => {
    await withAuthProviders(withoutProvider('local-userpass'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email: 'missing-local-register@example.com',
          password: 'missing-pass'
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects local-userpass login when provider is missing', async () => {
    await withAuthProviders(withoutProvider('local-userpass'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/login`,
        payload: {
          username: 'missing-local-login@example.com',
          password: 'missing-pass'
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects local-userpass reset/send when provider is missing', async () => {
    await withAuthProviders(withoutProvider('local-userpass'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/reset/send`,
        payload: {
          email: 'missing-local-reset@example.com'
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects local-userpass registration when provider is disabled', async () => {
    await withAuthProviders(withDisabledProvider('local-userpass'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email: 'disabled-local-register@example.com',
          password: 'disabled-pass'
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects local-userpass login when provider is disabled', async () => {
    await withAuthProviders(withDisabledProvider('local-userpass'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/login`,
        payload: {
          username: 'disabled-local-login@example.com',
          password: 'disabled-pass'
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects local-userpass reset/send when provider is disabled', async () => {
    await withAuthProviders(withDisabledProvider('local-userpass'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/reset/send`,
        payload: {
          email: 'disabled-local-reset@example.com'
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects anon-user login when provider is missing', async () => {
    await withAuthProviders(withoutProvider('anon-user'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${ANON_AUTH_BASE_URL}/login`
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects anon-user login when provider is disabled', async () => {
    await withAuthProviders(withDisabledProvider('anon-user'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${ANON_AUTH_BASE_URL}/login`
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects custom-function login when provider is missing', async () => {
    await withAuthProviders(withoutProvider('custom-function'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${CUSTOM_FUNCTION_AUTH_BASE_URL}/login`,
        payload: {
          apiKey: 'missing-custom',
          options: {
            device: {
              sdkVersion: '1.0.0',
              platform: 'test',
              platformVersion: '1.0'
            }
          }
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects custom-function login when provider is disabled', async () => {
    await withAuthProviders(withDisabledProvider('custom-function'), async () => {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${CUSTOM_FUNCTION_AUTH_BASE_URL}/login`,
        payload: {
          apiKey: 'disabled-custom',
          options: {
            device: {
              sdkVersion: '1.0.0',
              platform: 'test',
              platformVersion: '1.0'
            }
          }
        }
      })
      expect(response.statusCode).toBe(500)
    })
  })

  it('rejects registration when the email is already used', async () => {
    const payload = {
      email: 'duplicate@example.com',
      password: 'dup-pass'
    }

    const first = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload
    })
    expect(first.statusCode).toBe(201)

    const second = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload
    })
    expect(second.statusCode).toBe(409)
    const body = second.json() as { error?: string; error_code?: string }
    expect(body.error).toBe('name already in use')
    expect(body.error_code).toBe('AccountNameInUse')
  })

  it('creates a unique email index for auth users', async () => {
    const indexes = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .indexes()
    const emailIndex = indexes.find((index) => {
      const key = index.key as Record<string, number>
      return key?.email === 1
    })

    expect(emailIndex).toBeDefined()
    expect(emailIndex?.unique).toBe(true)
  })

  it('assigns a fake email to anonymous users', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `${ANON_AUTH_BASE_URL}/login`
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as { user_id?: string }
    expect(body.user_id).toBeDefined()

    const authUser = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .findOne({ _id: new ObjectId(body.user_id!) })

    expect(authUser?.email).toBe(`anon-${body.user_id}@users.invalid`)
  })

  it('rejects registerUser when the email is already used', async () => {
    const token = getTokenFor(adminUser)
    expect(token).toBeDefined()

    const payload = {
      name: 'registerUser',
      arguments: [
        {
          email: 'service-dup@example.com',
          password: 'service-pass'
        }
      ]
    }

    const first = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload
    })
    expect(first.statusCode).toBe(200)
    const firstBody = first.json() as { insertedId?: string | null }
    expect(firstBody.insertedId).toBeDefined()

    const second = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload
    })
    expect(second.statusCode).toBe(400)
    const secondBody = second.json() as { error?: string; error_code?: string }
    expect(secondBody.error_code).toBe('FunctionExecutionError')
    const parsedError = secondBody.error ? (JSON.parse(secondBody.error) as { message?: string }) : {}
    expect(parsedError.message).toBe('This email address is already used')
  })

  it('deletes auth users via deleteUser function', async () => {
    const email = 'service-delete@example.com'
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email,
        password: 'service-delete-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    const token = getTokenFor(adminUser)
    expect(token).toBeDefined()

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'deleteUser',
        arguments: [
          {
            id: registrationBody.userId
          }
        ]
      }
    })
    expect(response.statusCode).toBe(200)
    const body = EJSON.deserialize(response.json()) as { deletedCount?: number }
    expect(body.deletedCount).toBe(1)

    const existing = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .findOne({ _id: new ObjectId(registrationBody.userId) })

    expect(existing).toBeNull()
  })

  it('rejects deleteUser when function is not run_as_system', async () => {
    const email = 'public-delete@example.com'
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email,
        password: 'public-delete-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    const token = getTokenFor(adminUser)
    expect(token).toBeDefined()

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'publicDeleteUser',
        arguments: [
          {
            id: registrationBody.userId
          }
        ]
      }
    })

    expect(response.statusCode).toBe(400)
    const body = response.json() as { error?: string; error_code?: string }
    expect(body.error_code).toBe('FunctionExecutionError')
    const parsedError = body.error ? (JSON.parse(body.error) as { message?: string }) : {}
    expect(parsedError.message).toBe('only run_as_system')

    const existing = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .findOne({ _id: new ObjectId(registrationBody.userId) })
    expect(existing).toBeDefined()
  })

  it('revokes refresh tokens on logout', async () => {
    const ip = '203.0.113.50'
    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      remoteAddress: ip,
      payload: {
        username: 'auth-owner@example.com',
        password: 'top-secret'
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { refresh_token?: string }
    expect(loginBody.refresh_token).toBeDefined()

    const refreshToken = loginBody.refresh_token!
    const session = await appInstance!.inject({
      method: 'POST',
      url: `${API_VERSION}/auth/session`,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${refreshToken}`
      }
    })
    expect(session.statusCode).toBe(201)

    const logout = await appInstance!.inject({
      method: 'DELETE',
      url: `${API_VERSION}/auth/session`,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${refreshToken}`
      }
    })
    expect(logout.statusCode).toBe(200)

    const sessionAfterLogout = await appInstance!.inject({
      method: 'POST',
      url: `${API_VERSION}/auth/session`,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${refreshToken}`
      }
    })
    expect(sessionAfterLogout.statusCode).toBe(401)
  })

  it('rejects access tokens issued before logout for protected functions', async () => {
    const ip = '203.0.113.55'
    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      remoteAddress: ip,
      payload: {
        username: 'auth-owner@example.com',
        password: 'top-secret'
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as {
      access_token?: string
      refresh_token?: string
    }
    expect(loginBody.access_token).toBeDefined()
    expect(loginBody.refresh_token).toBeDefined()

    const decodedAccessToken = JSON.parse(
      Buffer.from(loginBody.access_token!.split('.')[1], 'base64').toString('utf8')
    )
    const accessIssuedAt = Number(decodedAccessToken.iat)
    expect(Number.isFinite(accessIssuedAt)).toBe(true)

    const functionPayload = {
      name: 'find',
      arguments: [
        {
          database: DB_NAME,
          collection: TODO_COLLECTION,
          query: {}
        }
      ],
      service: 'mongodb-atlas'
    }

    const callBeforeLogout = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${loginBody.access_token}`
      },
      payload: functionPayload
    })
    expect(callBeforeLogout.statusCode).toBe(200)

    const logout = await appInstance!.inject({
      method: 'DELETE',
      url: `${API_VERSION}/auth/session`,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${loginBody.refresh_token}`
      }
    })
    expect(logout.statusCode).toBe(200)

    const authUserAfterLogout = await client
      .db(DB_NAME)
      .collection(AUTH_CONFIG.authCollection)
      .findOne({ _id: authUserIds.owner })
    expect(authUserAfterLogout?.lastLogoutAt).toBeDefined()
    const lastLogoutTime = new Date(authUserAfterLogout!.lastLogoutAt).getTime()
    expect(lastLogoutTime).toBeGreaterThanOrEqual(accessIssuedAt * 1000)

    const callAfterLogout = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${loginBody.access_token}`
      },
      payload: functionPayload
    })
    expect(callAfterLogout.statusCode).toBe(401)
  })

  it('rejects expired refresh tokens', async () => {
    const ip = '203.0.113.51'
    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      remoteAddress: ip,
      payload: {
        username: 'auth-owner@example.com',
        password: 'top-secret'
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { refresh_token?: string }
    expect(loginBody.refresh_token).toBeDefined()

    const refreshToken = loginBody.refresh_token!
    const refreshTokenHash = hashToken(refreshToken)
    await client
      .db(DB_NAME)
      .collection(AUTH_CONFIG.refreshTokensCollection)
      .updateOne(
        { tokenHash: refreshTokenHash },
        { $set: { expiresAt: new Date(Date.now() - 1000) } }
      )

    const sessionAfterExpiry = await appInstance!.inject({
      method: 'POST',
      url: `${API_VERSION}/auth/session`,
      remoteAddress: ip,
      headers: {
        authorization: `Bearer ${refreshToken}`
      }
    })
    expect(sessionAfterExpiry.statusCode).toBe(401)
  })

  it('rejects registration with invalid email or password', async () => {
    const invalidEmail = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'not-an-email',
        password: 'valid-pass-1'
      }
    })
    expect(invalidEmail.statusCode).toBe(400)

    const invalidPassword = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'valid-user@example.com',
        password: 'short'
      }
    })
    expect(invalidPassword.statusCode).toBe(400)
  })

  it('rejects login with invalid email or password format', async () => {
    const invalidEmail = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'not-an-email',
        password: 'top-secret'
      }
    })
    expect(invalidEmail.statusCode).toBe(400)

    const invalidPassword = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'auth-owner@example.com',
        password: 'short'
      }
    })
    expect(invalidPassword.statusCode).toBe(400)
  })

  it('rate limits login attempts by IP', async () => {
    const limit = DEFAULT_CONFIG.AUTH_LOGIN_MAX_ATTEMPTS
    const ip = '203.0.113.10'
    for (let i = 0; i < limit; i += 1) {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/login`,
        remoteAddress: ip,
        payload: {
          username: 'auth-owner@example.com',
          password: 'wrong-password'
        }
      })
      expect(response.statusCode).toBe(500)
    }

    const limited = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      remoteAddress: ip,
      payload: {
        username: 'auth-owner@example.com',
        password: 'wrong-password'
      }
    })
    expect(limited.statusCode).toBe(429)
  })

  it('rate limits reset requests by IP', async () => {
    const limit = DEFAULT_CONFIG.AUTH_RESET_MAX_ATTEMPTS
    const ip = '203.0.113.11'
    for (let i = 0; i < limit; i += 1) {
      const response = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/reset/send`,
        remoteAddress: ip,
        payload: {
          email: 'auth-owner@example.com'
        }
      })
      expect(response.statusCode).toBe(202)
    }

    const limited = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset/send`,
      remoteAddress: ip,
      payload: {
        email: 'auth-owner@example.com'
      }
    })
    expect(limited.statusCode).toBe(429)
  })

  it('handles password reset via reset/send and confirm reset', async () => {
    const newPassword = 'new-pass-1'
    const resetCall = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset/send`,
      payload: {
        email: 'auth-owner@example.com'
      }
    })
    expect(resetCall.statusCode).toBe(202)

    const resetRequest = await client
      .db(DB_NAME)
      .collection(RESET_PASSWORD_COLLECTION)
      .findOne({ email: 'auth-owner@example.com' })
    expect(resetRequest).toBeDefined()

    const confirmReset = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset`,
      payload: {
        password: newPassword,
        token: resetRequest?.token,
        tokenId: resetRequest?.tokenId
      }
    })
    expect(confirmReset.statusCode).toBe(200)

    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'auth-owner@example.com',
        password: newPassword
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { access_token?: string }
    expect(loginBody.access_token).toBeDefined()
  })

  it('allows password changes and invalidates the old password', async () => {
    const email = 'change-pass@example.com'
    const oldPassword = 'old-pass-1'
    const newPassword = 'new-pass-2'

    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email,
        password: oldPassword
      }
    })
    expect(registration.statusCode).toBe(201)

    const loginOld = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: email,
        password: oldPassword
      }
    })
    expect(loginOld.statusCode).toBe(200)

    const requestedPassword = 'request-pass-2'
    const resetCall = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset/call`,
      payload: {
        email,
        password: requestedPassword,
        arguments: []
      }
    })
    expect(resetCall.statusCode).toBe(202)

    const resetRequest = await client
      .db(DB_NAME)
      .collection(RESET_PASSWORD_COLLECTION)
      .findOne({ email })
    expect(resetRequest).toBeDefined()

    const confirmReset = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset`,
      payload: {
        password: newPassword,
        token: resetRequest?.token,
        tokenId: resetRequest?.tokenId
      }
    })
    expect(confirmReset.statusCode).toBe(200)

    const loginOldAgain = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: email,
        password: oldPassword
      }
    })
    expect(loginOldAgain.statusCode).toBe(500)

    const loginNew = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: email,
        password: newPassword
      }
    })
    expect(loginNew.statusCode).toBe(200)
  })

  it('rejects login with invalid credentials', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'auth-owner@example.com',
        password: 'wrong-password'
      }
    })

    expect(response.statusCode).toBe(500)
  })

  it('blocks password reset requests for unregistered emails', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset/send`,
      payload: {
        email: 'missing-user@example.com'
      }
    })

    expect(response.statusCode).toBe(202)
  })

  it('blocks reset confirmation without a valid token', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset`,
      payload: {
        password: 'any-password',
        token: 'invalid',
        tokenId: 'invalid'
      }
    })

    expect(response.statusCode).toBe(500)
    const body = response.json() as { message?: string }
    expect(body.message).toBe('Invalid token or tokenId provided')
  })

  // CUSTOM TESTS
  it('tries to read from auth_users', async () => {
    const res = getAuthUsersCollection(ownerUser).find({}).toArray()
    await expect(res).rejects.toThrow('READ FORBIDDEN!')
  })

  it('tries to read from auth_users via a lookup', async () => {
    const pipeline: Document[] = [
      {
        $lookup: {
          from: "auth_users",
          localField: 'userId',
          foreignField: 'userId',
          as: 'users'
        }
      }
    ]

    await expect(
      getTodosCollection(ownerUser).aggregate(pipeline).toArray()
    ).rejects.toThrow('READ FORBIDDEN!')
  })

  it('blocks unionWith to auth_users', async () => {
    const pipeline: Document[] = [
      {
        $unionWith: {
          coll: 'auth_users',
          pipeline: [
            {
              $match: {
                userId: ownerUser.id
              }
            }
          ]
        }
      }
    ]

    await expect(
      getTodosCollection(ownerUser).aggregate(pipeline).toArray()
    ).rejects.toThrow('READ FORBIDDEN!')
  })

  it('blocks facet lookup to auth_users', async () => {
    const pipeline: Document[] = [
      {
        $facet: {
          data: [
            {
              $lookup: {
                from: 'auth_users',
                let: { userId: '$userId' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$userId', '$$userId'] }
                    }
                  }
                ],
                as: 'users'
              }
            }
          ]
        }
      }
    ]

    await expect(
      getTodosCollection(ownerUser).aggregate(pipeline).toArray()
    ).rejects.toThrow('READ FORBIDDEN!')
  })

  it('filters sensitive fields in aggregate lookups', async () => {
    const pipeline: Document[] = [
      {
        $match: {
          userId: ownerUser.id
        }
      },
      {
        $lookup: {
          from: 'projects',
          let: { ownerId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$ownerId', '$$ownerId'] }
              }
            }
          ],
          as: 'projects'
        }
      }
    ]

    const res = (await getTodosCollection(ownerUser).aggregate(pipeline).toArray()) as Array<{
      projects?: ProjectDoc[]
    }>

    const projects = res.flatMap((item) => item.projects ?? [])
    expect(projects.length).toBeGreaterThan(0)
    projects.forEach((project) => {
      expect(project).toHaveProperty('summary')
      expect(project).not.toHaveProperty('secretNotes')
      expect(project).not.toHaveProperty('internalCode')
    })
  })


  afterAll(async () => {
    await appInstance?.close()
    await client.close()
    if (require.main) {
      require.main.path = originalMainPath
    }
  })

})
