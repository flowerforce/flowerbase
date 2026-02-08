import { FastifyInstance } from 'fastify'
import { MongoClient, ObjectId } from 'mongodb'
import { initialize } from '../../packages/flowerbase/src'
import { DEFAULT_CONFIG } from '../../packages/flowerbase/src/constants'
import { StateManager } from '../../packages/flowerbase/src/state'

type SetupDeps<TUser> = {
  DB_NAME: string
  AUTH_USERS_COLLECTION: string
  APP_ROOT: string
  MANAGE_REPLICA_SET: boolean
  resolveMongoUrl: () => string
  dropReplicaSetHint: (mongoUrl: string) => string
  ensureReplicaSet: (client: MongoClient) => Promise<void>
  ensureFilteredTriggerCollections: () => Promise<void>
  registerAccessToken: (user: TUser, authId: ObjectId) => void
  ownerUser: TUser
  guestUser: TUser
  adminUser: TUser
  authUserIds: { owner: ObjectId; guest: ObjectId; admin: ObjectId }
  getClient: () => MongoClient
  setClient: (client: MongoClient) => void
  setAppInstance: (app: FastifyInstance | undefined) => void
  setOriginalMainPath: (mainPath: string | undefined) => void
  onBeforeEach: () => Promise<void>
}

export const registerMongoAtlasE2eSetup = <TUser>({
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
  getClient,
  setClient,
  setAppInstance,
  setOriginalMainPath,
  onBeforeEach
}: SetupDeps<TUser>) => {
  beforeAll(async () => {
    DEFAULT_CONFIG.AUTH_REGISTER_MAX_ATTEMPTS = 1000
    DEFAULT_CONFIG.AUTH_LOGIN_MAX_ATTEMPTS = 1000
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

    const client = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 60000 })
    setClient(client)
    await getClient().connect()
    await ensureFilteredTriggerCollections()
    try {
      await getClient().db(DB_NAME).createCollection(AUTH_USERS_COLLECTION)
    } catch {
      // ignore if it already exists
    }
    try {
      await getClient().db(DB_NAME).command({
        collMod: AUTH_USERS_COLLECTION,
        changeStreamPreAndPostImages: { enabled: true }
      })
    } catch {
      // ignore if pre/post images are not supported
    }
    setOriginalMainPath(require.main?.path)
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

    const appInstance = StateManager.select('app')
    setAppInstance(appInstance)
    registerAccessToken(ownerUser, authUserIds.owner)
    registerAccessToken(guestUser, authUserIds.guest)
    registerAccessToken(adminUser, authUserIds.admin)
    await new Promise((resolve) => setTimeout(resolve, 300))
  })

  beforeEach(async () => {
    await onBeforeEach()
  })
}
