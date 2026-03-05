import path from 'node:path'
import { FastifyInstance } from 'fastify'
import { Binary, MongoClient, ObjectId } from 'mongodb'
import { registerMongoAtlasE2eSetup } from './mongodb-atlas.rules.e2e.setup'

jest.setTimeout(120000)

const APP_ROOT = path.join(__dirname, 'app')
const DB_NAME = 'flowerbase-e2e'
const COLLECTION = 'csfleRecords'
const AUTH_USERS_COLLECTION = 'auth_users'
const KEY_VAULT_DB = 'encryption'
const KEY_VAULT_COLLECTION = '__keyVault'
const MANAGE_REPLICA_SET = process.env.MANAGE_REPLICA_SET === 'true'
const REPLICA_SET_NAME = process.env.REPLICA_SET_NAME ?? 'rs0'
const REPLICA_SET_HOST = process.env.REPLICA_SET_HOST ?? 'mongo:27017'
const DEFAULT_DB_URL = 'mongodb://localhost:27017'

type SetupUser = { id: string; email: string }

const ownerUser: SetupUser = { id: 'owner', email: 'owner@example.com' }
const guestUser: SetupUser = { id: 'guest', email: 'guest@example.com' }
const adminUser: SetupUser = { id: 'admin', email: 'admin@example.com' }

const authUserIds = {
  owner: new ObjectId('000000000000000000000801'),
  guest: new ObjectId('000000000000000000000802'),
  admin: new ObjectId('000000000000000000000803')
}

const resolveMongoUrl = () => {
  const value = process.env.DB_CONNECTION_STRING?.trim()
  return value && value.length > 0 ? value : DEFAULT_DB_URL
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

const isEncryptedBinary = (value: unknown): value is Binary =>
  value instanceof Binary && value.sub_type === 6

const binaryHex = (value: Binary) => Buffer.from(value.buffer).toString('hex')

describe('MongoDB CSFLE (e2e)', () => {
  let rawClient: MongoClient
  let appInstance: FastifyInstance | undefined
  let originalMainPath: string | undefined

  const getEncryptedCollection = () => {
    if (!appInstance) {
      throw new Error('App instance not initialized')
    }
    return appInstance.mongo.client.db(DB_NAME).collection(COLLECTION)
  }

  const getRawCollection = () => rawClient.db(DB_NAME).collection(COLLECTION)

  const resetCollections = async () => {
    const db = rawClient.db(DB_NAME)
    await Promise.all([
      db.collection(COLLECTION).deleteMany({}),
      db.collection(AUTH_USERS_COLLECTION).deleteMany({}),
    ])
  };

  registerMongoAtlasE2eSetup({
    DB_NAME,
    AUTH_USERS_COLLECTION,
    APP_ROOT,
    MANAGE_REPLICA_SET,
    resolveMongoUrl,
    dropReplicaSetHint,
    ensureReplicaSet,
    ensureFilteredTriggerCollections: async () => undefined,
    registerAccessToken: () => undefined,
    ownerUser,
    guestUser,
    adminUser,
    authUserIds,
    getClient: () => rawClient,
    setClient: (value) => {
      rawClient = value
    },
    setAppInstance: (value) => {
      appInstance = value
    },
    setOriginalMainPath: (value) => {
      originalMainPath = value
    },
    onBeforeEach: resetCollections,
    initializeOverrides: {
      projectId: 'flowerbase-e2e-csfle',
      mongodbEncryptionConfig: {
        kmsProviders: [
          {
            provider: 'local',
            keyAlias: 'root-key',
            config: { key: new Uint8Array(Buffer.from('a'.repeat(96))) }
          },
          {
            provider: 'local',
            keyAlias: 'nested-key',
            config: { key: new Uint8Array(Buffer.from('b'.repeat(96))) }
          },
          {
            provider: 'local',
            keyAlias: 'deep-key',
            config: { key: new Uint8Array(Buffer.from('c'.repeat(96))) }
          }
        ],
        extraOptions: {
          mongocryptdBypassSpawn: true,
          cryptSharedLibPath: process.env.MONGO_CRYPT_SHARED_LIB_PATH,
          cryptSharedLibRequired: true
        }
      }
    }
  })

  afterAll(async () => {
    try {
      await Promise.all([
        rawClient.db(DB_NAME).collection(COLLECTION).drop(),
        rawClient.db(KEY_VAULT_DB).collection(KEY_VAULT_COLLECTION).drop()
      ])
    } catch {
      // ignore cleanup errors when setup/connection failed
    }

    await appInstance?.close()
    await rawClient?.close()
    if (require.main) {
      require.main.path = originalMainPath
    }
  })

  it('stores ciphertext at rest and returns plaintext through encrypted client', async () => {
    const _id = new ObjectId()
    const encryptedCollection = getEncryptedCollection()
    const rawCollection = getRawCollection()

    await encryptedCollection.insertOne({
      _id,
      deterministicSecret: 'det-value-1',
      randomSecret: 'rand-value-1',
      nestedObject: {
        deepSecret: 'nested-value-1'
      }
    })

    const decrypted = await encryptedCollection.findOne({ _id })
    expect(decrypted).toMatchObject({
      _id,
      deterministicSecret: 'det-value-1',
      randomSecret: 'rand-value-1',
      nestedObject: {
        deepSecret: 'nested-value-1'
      }
    })

    const raw = await rawCollection.findOne({ _id })
    expect(raw).toBeTruthy()
    expect(isEncryptedBinary(raw!.deterministicSecret)).toBe(true)
    expect(isEncryptedBinary(raw!.randomSecret)).toBe(true)
    expect(isEncryptedBinary((raw!.nestedObject as { deepSecret: unknown }).deepSecret)).toBe(true)
    expect(raw!.deterministicSecret).not.toBe('det-value-1')
    expect(raw!.randomSecret).not.toBe('rand-value-1')
  })

  it('does not match plaintext queries on raw client for encrypted fields', async () => {
    const _id = new ObjectId()
    const encryptedCollection = getEncryptedCollection()
    const rawCollection = getRawCollection()

    await encryptedCollection.insertOne({
      _id,
      deterministicSecret: 'query-value',
      randomSecret: 'query-random',
      nestedObject: {
        deepSecret: 'query-nested'
      }
    })

    const rawMatch = await rawCollection.findOne({ deterministicSecret: 'query-value' })
    expect(rawMatch).toBeNull()

    const encryptedMatch = await encryptedCollection.findOne({ deterministicSecret: 'query-value' })
    expect(encryptedMatch?._id).toEqual(_id)
  })

  it('uses stable ciphertext for deterministic encryption and variable ciphertext for random encryption', async () => {
    const firstId = new ObjectId()
    const secondId = new ObjectId()
    const encryptedCollection = getEncryptedCollection()
    const rawCollection = getRawCollection()

    await encryptedCollection.insertMany([
      {
        _id: firstId,
        deterministicSecret: 'same-deterministic',
        randomSecret: 'same-random',
        nestedObject: { deepSecret: 'same-nested' }
      },
      {
        _id: secondId,
        deterministicSecret: 'same-deterministic',
        randomSecret: 'same-random',
        nestedObject: { deepSecret: 'same-nested' }
      }
    ])

    const firstRaw = await rawCollection.findOne({ _id: firstId })
    const secondRaw = await rawCollection.findOne({ _id: secondId })
    expect(firstRaw).toBeTruthy()
    expect(secondRaw).toBeTruthy()
    expect(isEncryptedBinary(firstRaw!.deterministicSecret)).toBe(true)
    expect(isEncryptedBinary(secondRaw!.deterministicSecret)).toBe(true)
    expect(isEncryptedBinary(firstRaw!.randomSecret)).toBe(true)
    expect(isEncryptedBinary(secondRaw!.randomSecret)).toBe(true)

    const firstDeterministic = firstRaw!.deterministicSecret as Binary
    const secondDeterministic = secondRaw!.deterministicSecret as Binary
    const firstRandom = firstRaw!.randomSecret as Binary
    const secondRandom = secondRaw!.randomSecret as Binary

    expect(binaryHex(firstDeterministic)).toBe(binaryHex(secondDeterministic))
    expect(binaryHex(firstRandom)).not.toBe(binaryHex(secondRandom))
  })
})
