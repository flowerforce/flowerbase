import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { MongoClient, ObjectId } from 'mongodb'
import { hashPassword } from '../../packages/flowerbase/src/utils/crypto'

jest.setTimeout(120000)

const API_VERSION = '/api/client/v2.0'
const PROJECT_ID = 'flowerbase-e2e-custom-user-data'
const AUTH_USERS_COLLECTION = 'auth_users'
const USER_COLLECTION = 'users'

const SOURCE_APP_ROOT = path.join(__dirname, 'app')

const resolveMongoUrl = () => {
    const value = process.env.DB_CONNECTION_STRING?.trim()
    return value && value.length > 0 ? value : 'mongodb://localhost:27017'
}

const copyFixtureApp = (customUserData: Record<string, unknown>) => {
    const tempRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), 'flowerbase-e2e-custom-user-data-')
    )

    fs.cpSync(SOURCE_APP_ROOT, tempRoot, {
        recursive: true
    })

    fs.writeFileSync(
        path.join(tempRoot, 'auth', 'custom_user_data.json'),
        JSON.stringify(customUserData, null, 2)
    )

    return tempRoot
}

const startApp = async ({
    enabled,
    dbName
}: {
    enabled: boolean
    dbName: string
}) => {
    jest.resetModules()

    const appRoot = copyFixtureApp({
        enabled,
        mongo_service_name: 'mongodb-atlas',
        database_name: dbName,
        collection_name: 'users',
        user_id_field: 'id',
        on_user_creation_function_name: enabled ? 'onCreateUser' : ''
    })

    process.env.FLOWERBASE_APP_PATH = appRoot

    const { initialize } = await import('../../packages/flowerbase/src')
    const { StateManager } = await import('../../packages/flowerbase/src/state')

    await initialize({
        projectId: PROJECT_ID,
        mongodbUrl: resolveMongoUrl(),
        jwtSecret: 'e2e-secret',
        port: 0,
        host: '127.0.0.1',
        basePath: appRoot
    })

    const appInstance = StateManager.select('app')

    return {
        appRoot,
        appInstance
    }
}

let client: MongoClient
let apps: Array<{ close: () => Promise<void> }> = []

beforeAll(async () => {
    client = new MongoClient(resolveMongoUrl(), {
        serverSelectionTimeoutMS: 60000
    })

    await client.connect()
})

afterEach(async () => {
    for (const app of apps) {
        await app.close()
    }

    apps = []

    delete process.env.FLOWERBASE_APP_PATH
    jest.resetModules()
})

afterAll(async () => {
    await client.close()
})

it('uses linked custom user collection when custom_user_data is enabled', async () => {
    const dbName = 'flowerbase-e2e-cud-enabled'
    const db = client.db(dbName)

    await db.collection(AUTH_USERS_COLLECTION).deleteMany({})
    await db.collection(USER_COLLECTION).deleteMany({})
    await db.collection('auth_refresh_tokens').deleteMany({})

    const { appInstance } = await startApp({
        enabled: true,
        dbName
    })

    apps.push(appInstance!)

    const authUserId = new ObjectId()
    const email = 'enabled-custom-data@example.com'
    const password = 'enabled-pass'

    await db.collection(AUTH_USERS_COLLECTION).insertOne({
        _id: authUserId,
        email,
        password: await hashPassword(password),
        status: 'confirmed',
        custom_data: {
            role: 'from-auth-users',
            source: 'auth_users'
        },
        identities: [
            {
                provider_type: 'local-userpass',
                provider_data: { email }
            }
        ]
    })

    await db.collection(USER_COLLECTION).insertOne({
        _id: new ObjectId(),
        id: authUserId.toString(),
        role: 'from-users-collection',
        source: 'users',
        tenantId: 'tenant-enabled'
    })

    const login = await appInstance!.inject({
        method: 'POST',
        url: `${API_VERSION}/app/${PROJECT_ID}/auth/providers/local-userpass/login`,
        payload: {
            username: email,
            password
        }
    })

    expect(login.statusCode).toBe(200)

    const loginBody = login.json() as {
        access_token?: string
    }

    expect(loginBody.access_token).toBeDefined()

    const profile = await appInstance!.inject({
        method: 'GET',
        url: `${API_VERSION}/auth/profile`,
        headers: {
            authorization: `Bearer ${loginBody.access_token}`
        }
    })

    expect(profile.statusCode).toBe(200)

    const profileBody = profile.json() as {
        custom_data?: Record<string, unknown>
    }

    expect(profileBody.custom_data).toEqual(
        expect.objectContaining({
            id: authUserId.toString(),
            role: 'from-users-collection',
            source: 'users',
            tenantId: 'tenant-enabled'
        })
    )

    expect(profileBody.custom_data?.role).not.toBe('from-auth-users')
})

it('uses auth_users.custom_data when custom_user_data is disabled', async () => {
    const dbName = 'flowerbase-e2e-cud-disabled'
    const db = client.db(dbName)

    await db.collection(AUTH_USERS_COLLECTION).deleteMany({})
    await db.collection(USER_COLLECTION).deleteMany({})
    await db.collection('auth_refresh_tokens').deleteMany({})

    const { appInstance } = await startApp({
        enabled: false,
        dbName
    })

    apps.push(appInstance!)

    const authUserId = new ObjectId()
    const email = 'disabled-custom-data@example.com'
    const password = 'disabled-pass'

    await db.collection(AUTH_USERS_COLLECTION).insertOne({
        _id: authUserId,
        email,
        password: await hashPassword(password),
        status: 'confirmed',
        custom_data: {
            role: 'from-auth-users',
            source: 'auth_users',
            tenantId: 'tenant-disabled',
            tryingToAddCustomData: true
        },
        identities: [
            {
                provider_type: 'local-userpass',
                provider_data: { email }
            }
        ]
    })

    await db.collection(USER_COLLECTION).insertOne({
        _id: new ObjectId(),
        id: authUserId.toString(),
        role: 'this-should-not-be-used',
        source: 'users'
    })

    const login = await appInstance!.inject({
        method: 'POST',
        url: `${API_VERSION}/app/${PROJECT_ID}/auth/providers/local-userpass/login`,
        payload: {
            username: email,
            password
        }
    })

    expect(login.statusCode).toBe(200)

    const loginBody = login.json() as {
        access_token?: string
    }

    expect(loginBody.access_token).toBeDefined()

    const profile = await appInstance!.inject({
        method: 'GET',
        url: `${API_VERSION}/auth/profile`,
        headers: {
            authorization: `Bearer ${loginBody.access_token}`
        }
    })

    expect(profile.statusCode).toBe(200)

    const profileBody = profile.json() as {
        custom_data?: Record<string, unknown>
    }

    expect(profileBody.custom_data).toEqual({
        role: 'from-auth-users',
        source: 'auth_users',
        tenantId: 'tenant-disabled',
        tryingToAddCustomData: true
    })

    expect(profileBody.custom_data?.role).not.toBe('this-should-not-be-used')
})