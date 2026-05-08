jest.mock('../../constants', () => ({
    AUTH_CONFIG: {
        authCollection: 'auth_users',
        localUserpassConfig: {
            autoConfirm: true
        }
    },
    AUTH_DB_NAME: 'test-auth-db'
}))

jest.mock('../../services/monitoring', () => ({
    emitServiceEvent: jest.fn()
}))

jest.mock('../../utils/crypto', () => ({
    hashPassword: jest.fn(async (password: string) => `hashed:${password}`),
    generateToken: jest.fn(() => 'generated-token')
}))

import handleUserRegistration from '../handleUserRegistration'
import { PROVIDER } from '../models/handleUserRegistration.model'

describe('handleUserRegistration', () => {
    it('saves registration payload into custom_data', async () => {
        const insertOne = jest.fn().mockResolvedValue({
            insertedId: {
                toString: () => 'user-1'
            }
        })

        const updateOne = jest.fn().mockResolvedValue({
            acknowledged: true
        })

        const findOne = jest.fn().mockResolvedValue(null)

        const collection = jest.fn(() => ({
            findOne,
            insertOne,
            updateOne
        }))

        const db = {
            collection
        }

        const app = {
            mongo: {
                client: {
                    db: jest.fn(() => db)
                }
            }
        }

        const payload = {
            tryingToAddCustomData: true,
            role: 'student'
        }

        await handleUserRegistration(app as never, {
            run_as_system: true,
            provider: PROVIDER.LOCAL_USERPASS
        })({
            email: 'john@doe.com',
            password: 'secret123',
            payload
        })

        expect(insertOne).toHaveBeenCalledWith(
            expect.objectContaining({
                email: 'john@doe.com',
                password: 'hashed:secret123',
                status: 'confirmed',
                custom_data: payload
            })
        )
    })

    it('saves an empty custom_data object when payload is missing', async () => {
        const insertOne = jest.fn().mockResolvedValue({
            insertedId: {
                toString: () => 'user-1'
            }
        })

        const updateOne = jest.fn().mockResolvedValue({
            acknowledged: true
        })

        const findOne = jest.fn().mockResolvedValue(null)

        const collection = jest.fn(() => ({
            findOne,
            insertOne,
            updateOne
        }))

        const db = {
            collection
        }

        const app = {
            mongo: {
                client: {
                    db: jest.fn(() => db)
                }
            }
        }

        await handleUserRegistration(app as never, {
            run_as_system: true,
            provider: PROVIDER.LOCAL_USERPASS
        })({
            email: 'john@doe.com',
            password: 'secret123'
        })

        expect(insertOne).toHaveBeenCalledWith(
            expect.objectContaining({
                custom_data: {}
            })
        )
    })
})