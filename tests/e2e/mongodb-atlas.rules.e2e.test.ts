import path from 'node:path'
import { FastifyInstance } from 'fastify'
import { MongoClient, ObjectId, Document, DeleteResult } from 'mongodb'
import { EJSON } from 'bson'
import { initialize } from '../../packages/flowerbase/src'
import { StateManager } from '../../packages/flowerbase/src/state'
import { API_VERSION } from '../../packages/flowerbase/src/constants'
import { hashPassword } from '../../packages/flowerbase/src/utils/crypto'
import type { User } from '../../packages/flowerbase/src/auth/dtos'

jest.setTimeout(60000)

const APP_ROOT = path.join(__dirname, 'app')
const DB_NAME = 'flowerbase-e2e'
const TODO_COLLECTION = 'todos'
const USER_COLLECTION = 'users'
const ACTIVITIES_COLLECTION = 'activities'
const COUNTERS_COLLECTION = 'counters'
const AUTH_USERS_COLLECTION = 'auth_users'
const RESET_PASSWORD_COLLECTION = 'reset-password-requests'
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
    workspaces: ['workspace-1', 'workspace-2'],
    adminIn: ['workspace-1', 'workspace-2']
  }
} as TestUser
const TRIGGER_EVENTS_COLLECTION = 'triggerEvents'
const PROJECT_ID = 'flowerbase-e2e'
const FUNCTION_CALL_URL = `${API_VERSION}/app/${PROJECT_ID}/functions/call`
const AUTH_BASE_URL = `${API_VERSION}/app/${PROJECT_ID}/auth/providers/local-userpass`
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
  update,
  document,
  pipeline
}: {
  collection: string
  method:
  | 'find'
  | 'findOne'
  | 'deleteOne'
  | 'deleteMany'
  | 'insertOne'
  | 'updateOne'
  | 'aggregate'
  user: TestUser | null
  query?: Document
  update?: Document
  document?: Document
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
        update: serializeValue(update),
        document: serializeValue(document),
        pipeline: pipeline?.map((stage) => serializeValue(stage))
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

  return response.json()
}

const createCollectionProxy = (collection: string, user: TestUser | null) => ({
  find: (query: Document = {}) => ({
    toArray: async () => callServiceOperation({ collection, method: 'find', user, query })
  }),
  aggregate: (pipeline: Document[] = []) => ({
    toArray: async () => callServiceOperation({ collection, method: 'aggregate', user, pipeline })
  }),
  findOne: (query: Document = {}) => callServiceOperation({ collection, method: 'findOne', user, query }),
  insertOne: (document: Document) => callServiceOperation({ collection, method: 'insertOne', user, document }),
  updateOne: (query: Document, update: Document) =>
    callServiceOperation({ collection, method: 'updateOne', user, query, update }),
  deleteOne: (query: Document) => callServiceOperation({ collection, method: 'deleteOne', user, query }),
  deleteMany: (query: Document = {}) =>
    callServiceOperation({ collection, method: 'deleteMany', user, query }),
})

const getTodosCollection = (user: TestUser | null) => createCollectionProxy(TODO_COLLECTION, user)
const getUsersCollection = (user: TestUser | null) => createCollectionProxy(USER_COLLECTION, user)
const getAuthUsersCollection = (user: TestUser | null) => createCollectionProxy(AUTH_USERS_COLLECTION, user)
const getProjectsCollection = (user: TestUser | null) => createCollectionProxy('projects', user)
const getActivityLogsCollection = (user: TestUser | null) => createCollectionProxy('activityLogs', user)
const getActivitiesCollection = (user: TestUser | null) => createCollectionProxy(ACTIVITIES_COLLECTION, user)
const getCountersCollection = (user: TestUser | null) => createCollectionProxy(COUNTERS_COLLECTION, user)

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

  const token = appInstance.createAccessToken({
    _id: authId,
    email: user.email,
    user_data: userData
  } as any)

  TOKEN_MAP[user.id] = token
}

type TodoDoc = Document & { userId: string }
type ProjectDoc = Document & {
  ownerId: string
  summary: string
  secretNotes?: string
  internalCode?: string
}
type ActivityLogDoc = Document & {
  status: string
  ownerId: string
}
type UserDoc = Document & {
  userId: string
  workspaces: string[]
  avatar: string
  name: string
  tags: string[]
  updatedAt: Date
}
type ActivityDoc = Document & {
  ownerId: string
  workspace: string
  visibility: {
    type: string
    users?: string[]
  }
  title: string
}
type CounterDoc = Document & {
  ownerId: string
  workspace: string
  visibility: {
    type: string
    users?: string[]
  }
  value: number
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
    db.collection(AUTH_USERS_COLLECTION).deleteMany({}),
    db.collection(TRIGGER_EVENTS_COLLECTION).deleteMany({})
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
  beforeAll(async () => {
    const mongoUrl = resolveMongoUrl()
    if (MANAGE_REPLICA_SET) {
      const maintenanceClient = new MongoClient(dropReplicaSetHint(mongoUrl), {
        serverSelectionTimeoutMS: 60000,
        directConnection: true
      })
      try {
        await maintenanceClient.connect()
        await ensureReplicaSet(maintenanceClient)
      } finally {
        await maintenanceClient.close()
      }
    }

    client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 60000 })
    await client.connect()
    originalMainPath = require.main?.path
    if (require.main) {
      require.main.path = APP_ROOT
    }

    await initialize({
      projectId: 'flowerbase-e2e',
      mongodbUrl: mongoUrl,
      jwtSecret: 'e2e-secret',
      port: 0,
      host: '127.0.0.1',
      basePath: APP_ROOT
    })

    appInstance = StateManager.select('app')
    registerAccessToken(ownerUser, authUserIds.owner)
    registerAccessToken(guestUser, authUserIds.guest)
    registerAccessToken(adminUser, authUserIds.admin)
    await new Promise((resolve) => setTimeout(resolve, 300))
  })

  beforeEach(async () => {
    await resetCollections()
  })

  it('richiede l\'autenticazione per accedere ai servizi MongoDB', async () => {
    await expect(getTodosCollection(null).find({}).toArray()).rejects.toThrow()
  })

  afterAll(async () => {
    await appInstance?.close()
    await client.close()
    if (require.main) {
      require.main.path = originalMainPath
    }
  })

  it('exports only the requesting user todos when reading', async () => {
    const todos = (await getTodosCollection(ownerUser).find({}).toArray()) as TodoDoc[]
    expect(todos).toHaveLength(2)
    expect(todos.every((todo) => todo.userId === ownerUser.id)).toBe(true)
  })

  it('denies inserting a todo for another user', async () => {
    await expect(
      getTodosCollection(ownerUser).insertOne({
        title: 'Not allowed',
        userId: guestUser.id
      })
    ).rejects.toThrow('Insert not permitted')
  })

  it('allows owners to insert their own todos', async () => {
    const insertResult = await getTodosCollection(ownerUser).insertOne({
      title: 'New owner task',
      userId: ownerUser.id
    })
    expect(insertResult.insertedId).toBeDefined()
    const inserted = (await getTodosCollection(ownerUser).findOne({
      _id: insertResult.insertedId
    })) as TodoDoc | null
    expect(inserted).toBeDefined()
    expect(inserted?.userId).toBe(ownerUser.id)
  })

  it('applica i filtri anche alle aggregazioni', async () => {
    const pipeline: Document[] = [
      {
        $group: {
          _id: '$userId',
          count: { $sum: 1 }
        }
      }
    ]

    const summary = (await getTodosCollection(ownerUser).aggregate(pipeline).toArray()) as Array<{
      _id: string
      count: number
    }>

    expect(summary).toHaveLength(1)
    expect(summary[0]).toEqual({ _id: ownerUser.id, count: 2 })
  })

  it('blocca le pipeline con stage non permessi nelle aggregate', async () => {
    const pipeline: Document[] = [
      {
        $out: 'forbidden'
      }
    ]

    await expect(
      getTodosCollection(ownerUser).aggregate(pipeline).toArray()
    ).rejects.toThrow('Stage $out is not allowed in client aggregate pipelines')
  })

  it('richiede una pipeline per unionWith nelle aggregate client', async () => {
    const pipeline: Document[] = [
      {
        $unionWith: 'projects'
      }
    ]

    await expect(
      getTodosCollection(ownerUser).aggregate(pipeline).toArray()
    ).rejects.toThrow('$unionWith must provide a pipeline when called from the client')
  })

  it('applica i filtri anche nelle aggregazioni activityLogs per utenti non admin', async () => {
    const pipeline: Document[] = [
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]

    const summary = (await getActivityLogsCollection(ownerUser)
      .aggregate(pipeline)
      .toArray()) as Array<{ _id: string; count: number }>

    expect(summary).toHaveLength(1)
    expect(summary[0]._id).toBe('active')
  })

  it('consente agli admin di aggregare tutti gli activityLogs', async () => {
    const pipeline: Document[] = [
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]

    const summary = (await getActivityLogsCollection(adminUser)
      .aggregate(pipeline)
      .toArray()) as Array<{ _id: string; count: number }>

    const statuses = summary.map((item) => item._id).sort()
    expect(statuses).toEqual(['active', 'inactive'])
  })

  it('prevents deleting todos that do not belong to the user', async () => {
    await expect(
      getTodosCollection(ownerUser).deleteOne({ _id: todoIds.otherUser })
    ).rejects.toThrow('Delete not permitted')
  })

  it('allows deleting owned todos', async () => {
    const deleteResult = (await getTodosCollection(ownerUser).deleteOne({
      _id: todoIds.ownerFirst
    })) as DeleteResult
    expect(deleteResult.deletedCount).toBe(1)
  })

  it('consente agli utenti di cancellare solo i propri todo con deleteMany', async () => {
    const deleteResult = (await getTodosCollection(ownerUser).deleteMany({})) as DeleteResult
    expect(deleteResult.deletedCount).toBe(2)

    const remainingOwner = (await getTodosCollection(ownerUser).find({}).toArray()) as TodoDoc[]
    expect(remainingOwner).toHaveLength(0)

    const remainingGuest = (await getTodosCollection(guestUser).find({}).toArray()) as TodoDoc[]
    expect(remainingGuest).toHaveLength(1)
  })

  it('non cancella documenti altrui con deleteMany', async () => {
    const deleteResult = (await getTodosCollection(ownerUser).deleteMany({
      userId: guestUser.id
    })) as DeleteResult
    expect(deleteResult.deletedCount).toBe(0)

    const remainingOwner = (await getTodosCollection(ownerUser).find({}).toArray()) as TodoDoc[]
    expect(remainingOwner).toHaveLength(2)
  })

  it('consente al guest di cancellare il proprio todo con deleteOne', async () => {
    const deleteResult = (await getTodosCollection(guestUser).deleteOne({
      _id: todoIds.otherUser
    })) as DeleteResult
    expect(deleteResult.deletedCount).toBe(1)
  })

  it('limita i profili ai workspace condivisi', async () => {
    const ownerUsers = (await getUsersCollection(ownerUser).find({}).toArray()) as UserDoc[]
    expect(ownerUsers).toHaveLength(1)
    expect(ownerUsers[0].workspaces).toContain('workspace-1')
    expect(ownerUsers[0].userId).toBe(ownerUser.id)

    const guestUsers = (await getUsersCollection(guestUser).find({}).toArray()) as UserDoc[]
    expect(guestUsers).toHaveLength(1)
    expect(guestUsers[0].workspaces).toContain('workspace-2')
    expect(guestUsers[0].userId).toBe(guestUser.id)

    const adminUsers = (await getUsersCollection(adminUser).find({}).toArray()) as UserDoc[]
    expect(adminUsers).toHaveLength(2)
  })

  it('consente di aggiornare il profilo solo al proprietario', async () => {
    const updatedName = 'Owner updated'
    const updateResult = await getUsersCollection(ownerUser).updateOne(
      { _id: userIds.owner },
      { $set: { name: updatedName } }
    )
    expect(updateResult.matchedCount).toBe(1)

    const ownerRecord = (await getUsersCollection(ownerUser).findOne({
      _id: userIds.owner
    })) as UserDoc | null
    expect(ownerRecord?.name).toBe(updatedName)

    await expect(
      getUsersCollection(guestUser).updateOne({ _id: userIds.owner }, { $set: { name: 'Hijack' } })
    ).rejects.toThrow('Update not permitted')
  })

  it('blocca l\'accesso alla collection auth_users senza regole', async () => {
    await expect(getAuthUsersCollection(ownerUser).find({}).toArray()).rejects.toThrow(
      'READ FORBIDDEN!'
    )
  })

  it('blocca gli inserimenti su auth_users senza regole', async () => {
    await expect(
      getAuthUsersCollection(ownerUser).insertOne({
        userId: ownerUser.id,
        email: 'blocked@example.com',
        password: 'xxx'
      })
    ).rejects.toThrow('CREATE FORBIDDEN!')
  })

  it('limits projects to the owner and hides forbidden fields', async () => {
    const projects = (await getProjectsCollection(ownerUser).find({}).toArray()) as ProjectDoc[]
    expect(projects).toHaveLength(1)
    expect(projects[0].ownerId).toBe(ownerUser.id)
    expect(projects[0]).not.toHaveProperty('secretNotes')
    expect(projects[0]).not.toHaveProperty('internalCode')
    expect(projects[0]).toHaveProperty('summary')
  })

  it('allows owners to update their project summary via function rules', async () => {
    const updateResult = await getProjectsCollection(ownerUser).updateOne(
      { _id: projectIds.ownerProject },
      { $set: { summary: 'Updated summary' } }
    )
    expect(updateResult.matchedCount).toBe(1)
    const updated = (await getProjectsCollection(ownerUser).findOne({
      _id: projectIds.ownerProject
    })) as ProjectDoc | null
    expect(updated?.summary).toBe('Updated summary')
  })

  it('prevents guests from updating projects they do not own', async () => {
    await expect(
      getProjectsCollection(guestUser).updateOne(
        { _id: projectIds.ownerProject },
        { $set: { summary: 'Should be blocked' } }
      )
    ).rejects.toThrow('Update not permitted')
  })

  it('lets admins read all projects and see privileged fields', async () => {
    const projects = (await getProjectsCollection(adminUser).find({}).toArray()) as ProjectDoc[]
    expect(projects.length).toBeGreaterThanOrEqual(2)
    const ownerProject = projects.find((project) => project.ownerId === ownerUser.id)
    expect(ownerProject).toBeDefined()
    expect(ownerProject).toHaveProperty('secretNotes', 'top secret')
  })

  it('returns only active activity logs for non-admin roles', async () => {
    const logs = (await getActivityLogsCollection(ownerUser).find({}).toArray()) as ActivityLogDoc[]
    expect(logs.every((log) => log.status === 'active')).toBe(true)
    expect(logs).toHaveLength(2)
  })

  it('allows admins to read all logs and insert new entries', async () => {
    const logs = (await getActivityLogsCollection(adminUser).find({}).toArray()) as ActivityLogDoc[]
    expect(logs.some((log) => log.status === 'inactive')).toBe(true)

    const insertResult = await getActivityLogsCollection(adminUser).insertOne({
      message: 'Admin log',
      status: 'inactive',
      ownerId: adminUser.id
    })
    expect(insertResult.insertedId).toBeDefined()
  })

  it('prevents non-admin users from inserting activity logs', async () => {
    await expect(
      getActivityLogsCollection(ownerUser).insertOne({
        message: 'Blocked log',
        status: 'inactive',
        ownerId: ownerUser.id
      })
    ).rejects.toThrow('Insert not permitted')
  })

  it('rispetta i filtri workspace/visibility per le attività', async () => {
    const ownerActivities = (await getActivitiesCollection(ownerUser).find({}).toArray()) as ActivityDoc[]
    expect(ownerActivities).toHaveLength(2)
    expect(ownerActivities.every((activity) => activity.workspace === 'workspace-1')).toBe(true)

    const guestActivities = (await getActivitiesCollection(guestUser).find({}).toArray()) as ActivityDoc[]
    expect(guestActivities).toHaveLength(1)
    expect(guestActivities[0].workspace).toBe('workspace-2')
  })

  it('limita la scrittura delle attività a proprietario o admin', async () => {
    const newTitle = 'Updated private activity'
    const updateResult = await getActivitiesCollection(ownerUser).updateOne(
      { _id: activityIds.ownerPrivate },
      { $set: { title: newTitle } }
    )
    expect(updateResult.matchedCount).toBe(1)

    const updatedActivity = (await getActivitiesCollection(ownerUser).findOne({
      _id: activityIds.ownerPrivate
    })) as ActivityDoc | null
    expect(updatedActivity?.title).toBe(newTitle)

    await expect(
      getActivitiesCollection(ownerUser).updateOne(
        { _id: activityIds.ownerPublic },
        { $set: { title: 'Blocked change' } }
      )
    ).rejects.toThrow('Update not permitted')

    const adminChange = await getActivitiesCollection(adminUser).updateOne(
      { _id: activityIds.ownerPublic },
      { $set: { title: 'Admin changed' } }
    )
    expect(adminChange.matchedCount).toBe(1)

    const adminActivity = (await getActivitiesCollection(adminUser).findOne({
      _id: activityIds.ownerPublic
    })) as ActivityDoc | null
    expect(adminActivity?.title).toBe('Admin changed')
  })

  it('applica i filtri complessi di visibilità sui contatori', async () => {
    const ownerCounters = (await getCountersCollection(ownerUser).find({}).toArray()) as CounterDoc[]
    expect(ownerCounters).toHaveLength(3)
    expect(ownerCounters.every((counter) => counter.workspace === 'workspace-1')).toBe(true)

    const guestCounters = (await getCountersCollection(guestUser).find({}).toArray()) as CounterDoc[]
    expect(guestCounters).toHaveLength(1)
    expect(guestCounters[0].visibility.users).toContain(guestUser.id)

    const adminCounters = (await getCountersCollection(adminUser).find({}).toArray()) as CounterDoc[]
    expect(adminCounters).toHaveLength(4)
  })

  it('richiede privilegi admin per modificare contatori protetti', async () => {
    const ownerUpdate = await getCountersCollection(ownerUser).updateOne(
      { _id: counterIds.adminOnly },
      { $set: { value: 450 } }
    )
    expect(ownerUpdate.matchedCount).toBe(1)

    const ownerCounter = (await getCountersCollection(ownerUser).findOne({
      _id: counterIds.adminOnly
    })) as CounterDoc | null
    expect(ownerCounter?.value).toBe(450)

    await expect(
      getCountersCollection(guestUser).updateOne({ _id: counterIds.adminOnly }, { $set: { value: 10 } })
    ).rejects.toThrow('Update not permitted')

    const adminUpdate = await getCountersCollection(adminUser).updateOne(
      { _id: counterIds.adminOnly },
      { $set: { value: 500 } }
    )
    expect(adminUpdate.matchedCount).toBe(1)

    const adminCounter = (await getCountersCollection(adminUser).findOne({
      _id: counterIds.adminOnly
    })) as CounterDoc | null
    expect(adminCounter?.value).toBe(500)
  })

  it('attiva il trigger sullo stream di activityLogs e salva il log', async () => {
    const newActivityId = new ObjectId()
    await getActivityLogsCollection(adminUser).insertOne({
      _id: newActivityId,
      title: 'Trigger test activity',
      ownerId: adminUser.id,
      workspace: 'workspace-1',
      visibility: {
        type: 'team'
      }
    })

    const recorded = await waitForTriggerEvent(newActivityId.toString())
    expect(recorded).not.toBeNull()
    expect(recorded?.operationType).toBe('insert')
    expect(recorded?.documentId).toBe(newActivityId.toString())
  })

  it('espone il nuovo endpoint API tramite la funzione dedicata', async () => {
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

  it('permette registrazione e login tramite local-userpass', async () => {
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

  it('rigetta la registrazione quando l\'email è già usata', async () => {
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
    expect(second.statusCode).toBe(500)
    const body = second.json() as { message?: string }
    expect(body.message).toBe('This email address is already used')
  })

  it('gestisce il reset password tramite reset/send e confirm reset', async () => {
    const requestedPassword = 'request-pass-1'
    const newPassword = 'new-pass-1'
    const resetCall = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset/send`,
      payload: {
        email: 'auth-owner@example.com'
      }
    })
    expect(resetCall.statusCode).toBe(200)

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

  it('consente di cambiare password e invalida la vecchia', async () => {
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
    expect(resetCall.statusCode).toBe(200)

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

  it('rigetta il login con credenziali invalide', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/login`,
      payload: {
        username: 'auth-owner@example.com',
        password: 'wrong-password'
      }
    })

    expect(response.statusCode).toBe(500)
    const body = response.json() as { message?: string }
    expect(body.message).toBe('Invalid credentials')
  })

  it('blocca la richiesta di reset password per email non registrata', async () => {
    const response = await appInstance!.inject({
      method: 'POST',
      url: `${AUTH_BASE_URL}/reset/send`,
      payload: {
        email: 'missing-user@example.com'
      }
    })

    expect(response.statusCode).toBe(500)
    const body = response.json() as { message?: string }
    expect(body.message).toBe('Invalid credentials')
  })

  it('blocca la conferma reset senza token valido', async () => {
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
  it('Provo a leggere da auth_users', async () => {
    const res = getAuthUsersCollection(ownerUser).find({}).toArray()
    await expect(res).rejects.toThrow('READ FORBIDDEN!')
  })

  it('Provo a leggere da auth_users passando da un lookup', async () => {
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

  it('blocca unionWith verso auth_users', async () => {
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

  it('blocca lookup in facet verso auth_users', async () => {
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

  it('filtra i campi sensibili nelle lookup aggregate', async () => {
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


})
