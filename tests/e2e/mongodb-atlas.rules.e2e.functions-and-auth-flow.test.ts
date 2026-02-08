import path from 'node:path'
import { FastifyInstance } from 'fastify'
import { Document, MongoClient, ObjectId } from 'mongodb'
import type { User } from '../../packages/flowerbase/src/auth/dtos'
import { API_VERSION, AUTH_CONFIG } from '../../packages/flowerbase/src/constants'
import { hashPassword } from '../../packages/flowerbase/src/utils/crypto'
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
const TOKEN_MAP: Record<string, string> = {}

const getTokenFor = (user: TestUser | null) => {
  if (!user) return undefined
  return TOKEN_MAP[user.id]
}

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

const waitForTriggerEvent = async (documentId: string) => {
  const collection = client.db(DB_NAME).collection(TRIGGER_EVENTS_COLLECTION)
  for (let attempt = 0; attempt < 10; attempt++) {
    const record = await collection.findOne({ documentId })
    if (record) {
      return record
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

const waitForTriggerEventType = async (documentId: string, type: string) => {
  const collection = client.db(DB_NAME).collection(TRIGGER_EVENTS_COLLECTION)
  for (let attempt = 0; attempt < 10; attempt++) {
    const record = await collection.findOne({ documentId, type })
    if (record) {
      return record
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
}

const waitForProviderTriggerEventType = async (documentId: string, type: string) => {
  const collection = client.db(DB_NAME).collection(PROVIDER_TRIGGER_EVENTS_COLLECTION)
  for (let attempt = 0; attempt < 10; attempt++) {
    const record = await collection.findOne({ documentId, type })
    if (record) {
      return record
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return null
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

  it('fires scheduled trigger', async () => {
    const event = await waitForTriggerEventType('scheduled-trigger', 'scheduled')
    expect(event).toBeDefined()
  })

  it('executes logTriggerEvent function directly', async () => {
    const changeEventId = new ObjectId()
    const token = getTokenFor(adminUser)
    expect(token).toBeDefined()

    const changeEvent: Document = {
      operationType: 'insert',
      ns: {
        coll: 'activityLogs',
        db: DB_NAME
      },
      documentKey: {
        _id: changeEventId
      },
      fullDocument: {
        _id: changeEventId,
        ownerId: adminUser.id,
        workspace: 'workspace-1'
      }
    }

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'logTriggerEvent',
        arguments: [changeEvent]
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      recorded: true,
      documentId: changeEventId.toString()
    })

    const logged = await client.db(DB_NAME).collection(TRIGGER_EVENTS_COLLECTION).findOne({
      documentId: changeEventId.toString()
    })

    expect(logged).toMatchObject({
      operationType: 'insert',
      collection: 'activityLogs',
      documentId: changeEventId.toString()
    })
  })

  it('blocks private function when invoked via API', async () => {
    const token = getTokenFor(ownerUser)
    expect(token).toBeDefined()

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'privateEcho',
        arguments: []
      }
    })

    expect(response.statusCode).toBe(500)
    const body = response.json() as { message?: string }
    expect(body.message).toBe('Function "privateEcho" is private')
  })

  it('returns error payload when a function returns an Error object', async () => {
    const token = getTokenFor(ownerUser)
    expect(token).toBeDefined()

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'returnError',
        arguments: []
      }
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      message: 'Max subscribers created',
      name: 'Error'
    })
  })

  it('allows run_as_system function to read all users', async () => {
    const token = getTokenFor(adminUser)
    expect(token).toBeDefined()

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'systemListUsers',
        arguments: []
      }
    })

    expect(response.statusCode).toBe(200)
    const body = response.json() as { count: number; users: Array<{ email: string }> }
    expect(body.count).toBe(2)
    expect(body.users).toHaveLength(2)
    expect(body.users.map((user) => user.email).sort()).toEqual([
      'guest@example.com',
      'owner@example.com'
    ])
  })

  it('blocks run_as_system=false function from accessing auth_users', async () => {
    const token = getTokenFor(ownerUser)
    expect(token).toBeDefined()

    const response = await appInstance!.inject({
      method: 'POST',
      url: FUNCTION_CALL_URL,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        name: 'publicListAuthUsers',
        arguments: []
      }
    })

    expect(response.statusCode).toBe(400)
    const body = response.json() as { error?: string; error_code?: string }
    expect(body.error_code).toBe('FunctionExecutionError')
    const parsedError = body.error ? JSON.parse(body.error) as { message?: string } : {}
    expect(parsedError.message).toBe('READ FORBIDDEN!')
  })

  it('exposes the new API endpoint through the dedicated function', async () => {
    const response = await appInstance!.inject({
      method: 'GET',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspace?workspace=workspace-1`
    })
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({
      success: true,
      workspace: 'workspace-1',
      source: 'api_checkWorkspace'
    })
  })

  it('supports httpMethod in endpoint configs', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspacePost?workspace=workspace-2`
    })
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({
      success: true,
      workspace: 'workspace-2',
      source: 'api_checkWorkspace'
    })

    const getResponse = await appInstance!.inject({
      method: 'GET',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspacePost?workspace=workspace-2`
    })
    expect([404, 405]).toContain(getResponse.statusCode)
  })

  it('registers all methods when http_method is wildcard', async () => {
    const getResponse = await appInstance!.inject({
      method: 'GET',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspaceAll?workspace=workspace-3`
    })
    expect(getResponse.statusCode).toBe(202)
    expect(getResponse.json()).toEqual({
      success: true,
      workspace: 'workspace-3',
      source: 'api_checkWorkspace'
    })

    const postResponse = await appInstance!.inject({
      method: 'POST',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspaceAll?workspace=workspace-3`
    })
    expect(postResponse.statusCode).toBe(202)
    expect(postResponse.json()).toEqual({
      success: true,
      workspace: 'workspace-3',
      source: 'api_checkWorkspace'
    })
  })

  it('defaults to POST when http_method is missing', async () => {
    const postResponse = await appInstance!.inject({
      method: 'POST',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspaceFallback?workspace=workspace-4`
    })
    expect(postResponse.statusCode).toBe(202)
    expect(postResponse.json()).toEqual({
      success: true,
      workspace: 'workspace-4',
      source: 'api_checkWorkspace'
    })

    const getResponse = await appInstance!.inject({
      method: 'GET',
      url: `/app/${PROJECT_ID}/endpoint/api/checkWorkspaceFallback?workspace=workspace-4`
    })
    expect([404, 405]).toContain(getResponse.statusCode)
  })

  it('allows registration and login via local-userpass', async () => {
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'new-user@example.com',
        password: 'new-user-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'auth-owner@example.com',
        password: 'top-secret'
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as {
      access_token?: string
      refresh_token?: string
      user_id?: string
    }
    expect(loginBody.access_token).toBeDefined()
    expect(loginBody.refresh_token).toBeDefined()
    expect(loginBody.user_id).toBe(authUserIds.owner.toString())
  })

  it('runs confirmation function when autoConfirm is false', async () => {
    const originalConfig = AUTH_CONFIG.localUserpassConfig
    AUTH_CONFIG.localUserpassConfig = {
      ...originalConfig,
      autoConfirm: false,
      runConfirmationFunction: true,
      confirmationFunctionName: 'confirmUser'
    }

    try {
      const email = 'confirm-success@example.com'
      const registration = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email,
          password: 'auto-pass'
        }
      })
      expect(registration.statusCode).toBe(201)

      const confirmationEvent = await waitForTriggerEvent(email)
      expect(confirmationEvent).toBeDefined()
      expect(confirmationEvent?.type).toBe('user_confirmation')
      expect(confirmationEvent?.email).toBe(email)

      const authUser = await client
        .db(DB_NAME)
        .collection(AUTH_USERS_COLLECTION)
        .findOne({ email })
      expect(authUser?.status).toBe('confirmed')
    } finally {
      AUTH_CONFIG.localUserpassConfig = originalConfig
    }
  })

  it('keeps users pending when confirmation function returns pending', async () => {
    const originalConfig = AUTH_CONFIG.localUserpassConfig
    AUTH_CONFIG.localUserpassConfig = {
      ...originalConfig,
      autoConfirm: false,
      runConfirmationFunction: true,
      confirmationFunctionName: 'confirmUser'
    }

    try {
      const email = 'pending-user@example.com'
      const registration = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email,
          password: 'auto-pass'
        }
      })
      expect(registration.statusCode).toBe(201)

      const authUser = await client
        .db(DB_NAME)
        .collection(AUTH_USERS_COLLECTION)
        .findOne({ email })
      expect(authUser?.status).toBe('pending')

      const login = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/login`,
        payload: {
          username: email,
          password: 'auto-pass'
        }
      })
      expect(login.statusCode).toBe(500)
      const loginBody = login.json() as { message?: string }
      expect(loginBody.message).toBe('User not confirmed')
    } finally {
      AUTH_CONFIG.localUserpassConfig = originalConfig
    }
  })

  it('does not fire on_user_creation for non-confirming updates', async () => {
    const originalConfig = AUTH_CONFIG.localUserpassConfig
    AUTH_CONFIG.localUserpassConfig = {
      ...originalConfig,
      autoConfirm: false,
      runConfirmationFunction: true,
      confirmationFunctionName: 'confirmUser'
    }

    try {
      const email = 'pending-update-no-trigger@example.com'
      const registration = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email,
          password: 'auto-pass'
        }
      })
      expect(registration.statusCode).toBe(201)
      const registrationBody = registration.json() as { userId?: string }
      expect(registrationBody.userId).toBeDefined()

      const initialEvent = await waitForTriggerEventType(
        registrationBody.userId!,
        'on_user_creation'
      )
      expect(initialEvent).toBeNull()

      const updateResult = await client
        .db(DB_NAME)
        .collection(AUTH_USERS_COLLECTION)
        .updateOne(
          { _id: new ObjectId(registrationBody.userId) },
          { $set: { status: 'failed' } }
        )
      expect(updateResult.matchedCount).toBe(1)

      const afterEvent = await waitForTriggerEventType(
        registrationBody.userId!,
        'on_user_creation'
      )
      expect(afterEvent).toBeNull()
    } finally {
      AUTH_CONFIG.localUserpassConfig = originalConfig
    }
  })

  it('confirms users via token and tokenId from the client', async () => {
    const originalConfig = AUTH_CONFIG.localUserpassConfig
    AUTH_CONFIG.localUserpassConfig = {
      ...originalConfig,
      autoConfirm: false,
      runConfirmationFunction: true,
      confirmationFunctionName: 'confirmUser'
    }

    try {
      const email = 'pending-confirm@example.com'
      const password = 'auto-pass'
      const registration = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email,
          password
        }
      })
      expect(registration.statusCode).toBe(201)

      const authUser = await client
        .db(DB_NAME)
        .collection(AUTH_USERS_COLLECTION)
        .findOne({ email }) as { confirmationToken?: string; confirmationTokenId?: string } | null
      expect(authUser?.confirmationToken).toBeDefined()
      expect(authUser?.confirmationTokenId).toBeDefined()

      const confirm = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/confirm`,
        payload: {
          token: authUser!.confirmationToken,
          tokenId: authUser!.confirmationTokenId
        }
      })
      expect(confirm.statusCode).toBe(200)

      const login = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/login`,
        payload: {
          username: email,
          password
        }
      })
      expect(login.statusCode).toBe(200)
    } finally {
      AUTH_CONFIG.localUserpassConfig = originalConfig
    }
  })

  it('auto-confirms users on registration when autoConfirm is enabled', async () => {
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'autoconfirm-user@example.com',
        password: 'auto-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    const authUser = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .findOne({ _id: new ObjectId(registrationBody.userId) })
    expect(authUser?.status).toBe('confirmed')
  })

  it('fires on_user_creation when a pending user becomes confirmed', async () => {
    const originalConfig = AUTH_CONFIG.localUserpassConfig
    AUTH_CONFIG.localUserpassConfig = {
      ...originalConfig,
      autoConfirm: false,
      runConfirmationFunction: true,
      confirmationFunctionName: 'confirmUser'
    }

    try {
      const email = 'pending-trigger-update@example.com'
      const registration = await appInstance!.inject({
        method: 'POST',
        url: `${AUTH_BASE_URL}/register`,
        payload: {
          email,
          password: 'auto-pass'
        }
      })
      expect(registration.statusCode).toBe(201)

      const authUser = await client
        .db(DB_NAME)
        .collection(AUTH_USERS_COLLECTION)
        .findOne({ email })
      expect(authUser?.status).toBe('pending')

      await client
        .db(DB_NAME)
        .collection(AUTH_USERS_COLLECTION)
        .updateOne(
          { _id: authUser!._id },
          { $set: { status: 'confirmed' } }
        )

      const creationEvent = await waitForTriggerEventType(
        authUser!._id.toString(),
        'on_user_creation'
      )
      expect(creationEvent).toBeDefined()
      expect(creationEvent?.email).toBe(email)
    } finally {
      AUTH_CONFIG.localUserpassConfig = originalConfig
    }
  })

  it('fires on_user_creation_function_name on auto-confirmed registrations', async () => {
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'autoconfirm-trigger@example.com',
        password: 'auto-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    const creationEvent = await waitForTriggerEvent(registrationBody.userId!)
    expect(creationEvent).toBeDefined()
    expect(creationEvent?.type).toBe('on_user_creation')
    expect(creationEvent?.email).toBe('autoconfirm-trigger@example.com')
  })

  it('calls on_user_creation_function_name when auth user becomes confirmed', async () => {
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'trigger-user@example.com',
        password: 'trigger-pass'
      }
    })
    expect(registration.statusCode).toBe(201)

    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'trigger-user@example.com',
        password: 'trigger-pass'
      }
    })
    expect(login.statusCode).toBe(200)

    const loginBody = login.json() as { user_id?: string }
    expect(loginBody.user_id).toBeDefined()

    const creationEvent = await waitForTriggerEvent(loginBody.user_id!)
    expect(creationEvent).toBeDefined()
    expect(creationEvent?.type).toBe('on_user_creation')
    expect(creationEvent?.email).toBe('trigger-user@example.com')
  })

  it('ignores auth updates that do not confirm the user', async () => {
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'no-trigger-update@example.com',
        password: 'auto-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    await waitForTriggerEventType(registrationBody.userId!, 'on_user_creation')
    const beforeCount = await client
      .db(DB_NAME)
      .collection(TRIGGER_EVENTS_COLLECTION)
      .countDocuments({
        documentId: registrationBody.userId,
        type: 'on_user_creation'
      })

    await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .updateOne(
        { _id: new ObjectId(registrationBody.userId) },
        { $set: { lastLogoutAt: new Date() } }
      )

    await new Promise((resolve) => setTimeout(resolve, 300))
    const afterCount = await client
      .db(DB_NAME)
      .collection(TRIGGER_EVENTS_COLLECTION)
      .countDocuments({
        documentId: registrationBody.userId,
        type: 'on_user_creation'
      })

    expect(afterCount).toBe(beforeCount)
  })

  it('fires delete trigger when auth user is removed', async () => {
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email: 'delete-trigger@example.com',
        password: 'auto-pass'
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    await waitForTriggerEventType(registrationBody.userId!, 'on_user_creation')
    const deleteResult = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .deleteOne({ _id: new ObjectId(registrationBody.userId) })
    expect(deleteResult.deletedCount).toBe(1)

    const deleteEvent = await waitForTriggerEventType(
      registrationBody.userId!,
      'on_user_delete'
    )
    expect(deleteEvent).toBeDefined()
    expect(deleteEvent?.type).toBe('on_user_delete')
  })

  it('fires logout trigger when auth user logs out', async () => {
    const email = 'logout-trigger@example.com'
    const password = 'logout-pass'
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email,
        password
      }
    })
    expect(registration.statusCode).toBe(201)

    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: email,
        password
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { refresh_token?: string; user_id?: string }
    expect(loginBody.refresh_token).toBeDefined()
    expect(loginBody.user_id).toBeDefined()

    const logout = await appInstance!.inject({
      method: 'DELETE',
      url: `${API_VERSION}/auth/session`,
      headers: {
        authorization: `Bearer ${loginBody.refresh_token}`
      }
    })
    expect(logout.statusCode).toBe(200)

    const logoutEvent = await waitForTriggerEventType(
      loginBody.user_id!,
      'on_user_logout'
    )
    expect(logoutEvent).toBeDefined()
    expect(logoutEvent?.email).toBe(email)
  })

  it('fires provider-filtered create trigger for local-userpass only', async () => {
    const authId = new ObjectId()
    const email = 'provider-local-create@example.com'
    await client.db(DB_NAME).collection(AUTH_USERS_COLLECTION).insertOne({
      _id: authId,
      email,
      password: 'hashed',
      status: 'pending',
      createdAt: new Date(),
      identities: [
        {
          id: authId.toString(),
          provider_id: authId.toString(),
          provider_type: 'local-userpass',
          provider_data: { email }
        }
      ]
    })

    await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .updateOne({ _id: authId }, { $set: { status: 'confirmed' } })

    const localEvent = await waitForProviderTriggerEventType(
      authId.toString(),
      'auth_provider_create_local-userpass'
    )
    expect(localEvent).toBeDefined()
    const anonEvent = await waitForProviderTriggerEventType(
      authId.toString(),
      'auth_provider_create_anon-user'
    )
    expect(anonEvent).toBeNull()
  })

  it('fires provider-filtered create trigger for anon-user only', async () => {
    const authId = new ObjectId()
    await client.db(DB_NAME).collection(AUTH_USERS_COLLECTION).insertOne({
      _id: authId,
      email: `anon-${authId.toString()}@users.invalid`,
      status: 'pending',
      createdAt: new Date(),
      identities: [
        {
          id: authId.toString(),
          provider_id: authId.toString(),
          provider_type: 'anon-user',
          provider_data: {}
        }
      ]
    })

    await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .updateOne({ _id: authId }, { $set: { status: 'confirmed' } })

    const anonEvent = await waitForProviderTriggerEventType(
      authId.toString(),
      'auth_provider_create_anon-user'
    )
    expect(anonEvent).toBeDefined()
    const localEvent = await waitForProviderTriggerEventType(
      authId.toString(),
      'auth_provider_create_local-userpass'
    )
    expect(localEvent).toBeNull()
  })

  it('fires provider-filtered logout trigger for local-userpass only', async () => {
    const email = 'provider-local-logout@example.com'
    const password = 'logout-pass'
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email,
        password
      }
    })
    expect(registration.statusCode).toBe(201)

    const login = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: email,
        password
      }
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { refresh_token?: string; user_id?: string }
    expect(loginBody.refresh_token).toBeDefined()
    expect(loginBody.user_id).toBeDefined()

    const logout = await appInstance!.inject({
      method: 'DELETE',
      url: `${API_VERSION}/auth/session`,
      headers: {
        authorization: `Bearer ${loginBody.refresh_token}`
      }
    })
    expect(logout.statusCode).toBe(200)

    const localEvent = await waitForProviderTriggerEventType(
      loginBody.user_id!,
      'auth_provider_logout_local-userpass'
    )
    expect(localEvent).toBeDefined()
    const anonEvent = await waitForProviderTriggerEventType(
      loginBody.user_id!,
      'auth_provider_logout_anon-user'
    )
    expect(anonEvent).toBeNull()
  })

  it('fires provider-filtered logout trigger for anon-user only', async () => {
    const login = await appInstance!.inject({
      method: 'POST',
      url: `${ANON_AUTH_BASE_URL}/login`
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { refresh_token?: string; user_id?: string }
    expect(loginBody.refresh_token).toBeDefined()
    expect(loginBody.user_id).toBeDefined()

    const logout = await appInstance!.inject({
      method: 'DELETE',
      url: `${API_VERSION}/auth/session`,
      headers: {
        authorization: `Bearer ${loginBody.refresh_token}`
      }
    })
    expect(logout.statusCode).toBe(200)

    const anonEvent = await waitForProviderTriggerEventType(
      loginBody.user_id!,
      'auth_provider_logout_anon-user'
    )
    expect(anonEvent).toBeDefined()
    const localEvent = await waitForProviderTriggerEventType(
      loginBody.user_id!,
      'auth_provider_logout_local-userpass'
    )
    expect(localEvent).toBeNull()
  })

  it('fires provider-filtered delete trigger for local-userpass only', async () => {
    const email = 'provider-local-delete@example.com'
    const password = 'delete-pass'
    const registration = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/register`,
      payload: {
        email,
        password
      }
    })
    expect(registration.statusCode).toBe(201)
    const registrationBody = registration.json() as { userId?: string }
    expect(registrationBody.userId).toBeDefined()

    const deleteResult = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .deleteOne({ _id: new ObjectId(registrationBody.userId) })
    expect(deleteResult.deletedCount).toBe(1)

    const localEvent = await waitForProviderTriggerEventType(
      registrationBody.userId!,
      'auth_provider_delete_local-userpass'
    )
    expect(localEvent).toBeDefined()
    const anonEvent = await waitForProviderTriggerEventType(
      registrationBody.userId!,
      'auth_provider_delete_anon-user'
    )
    expect(anonEvent).toBeNull()
  })

  it('fires provider-filtered delete trigger for anon-user only', async () => {
    const login = await appInstance!.inject({
      method: 'POST',
      url: `${ANON_AUTH_BASE_URL}/login`
    })
    expect(login.statusCode).toBe(200)
    const loginBody = login.json() as { user_id?: string }
    expect(loginBody.user_id).toBeDefined()

    const deleteResult = await client
      .db(DB_NAME)
      .collection(AUTH_USERS_COLLECTION)
      .deleteOne({ _id: new ObjectId(loginBody.user_id) })
    expect(deleteResult.deletedCount).toBe(1)

    const anonEvent = await waitForProviderTriggerEventType(
      loginBody.user_id!,
      'auth_provider_delete_anon-user'
    )
    expect(anonEvent).toBeDefined()
    const localEvent = await waitForProviderTriggerEventType(
      loginBody.user_id!,
      'auth_provider_delete_local-userpass'
    )
    expect(localEvent).toBeNull()
  })

  afterAll(async () => {
    await appInstance?.close()
    await client.close()
    if (require.main) {
      require.main.path = originalMainPath
    }
  })

})
