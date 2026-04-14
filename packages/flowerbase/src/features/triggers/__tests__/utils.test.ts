import { ObjectId } from 'bson'
import { GenerateContext } from '../../../utils/context'
import { StateManager } from '../../../state'
import { TRIGGER_HANDLERS } from '../utils'

jest.mock('../../../utils/context', () => ({
    GenerateContext: jest.fn()
}))

jest.mock('../../../state', () => ({
    StateManager: {
        select: jest.fn()
    }
}))

const mockedGenerateContext = jest.mocked(GenerateContext)
const mockedStateSelect = StateManager.select as jest.Mock

describe('TRIGGER_HANDLERS.DATABASE', () => {
    beforeEach(() => {
        mockedGenerateContext.mockReset()
        mockedGenerateContext.mockResolvedValue(undefined)
        mockedStateSelect.mockReset()
        mockedStateSelect.mockReturnValue(undefined)
    })

    it('preserves BSON ObjectId values in fullDocument before invoking the trigger function', async () => {
        const changeListeners: Record<string, (...args: any[]) => unknown> = {}
        const close = jest.fn(async () => undefined)
        const watch = jest.fn(() => ({
            on: jest.fn((event: string, listener: (...args: any[]) => unknown) => {
                changeListeners[event] = listener
            }),
            close
        }))

        const collection = { watch }
        const db = jest.fn(() => ({ collection: jest.fn(() => collection) }))
        const client = { db }

        const app = {
            mongo: {
                changestream: { client }
            },
            server: {
                once: jest.fn()
            }
        } as any

        await TRIGGER_HANDLERS.DATABASE({
            config: {
                database: 'flowerbase-test',
                collection: 'activityLogs',
                operation_types: ['INSERT'],
                full_document: true,
                full_document_before_change: false,
                match: {},
                project: {}
            } as any,
            triggerHandler: { code: 'module.exports = async function () {}' } as any,
            functionsList: {
                logTriggerEvent: { code: 'module.exports = async function () {}' }
            } as any,
            services: {} as any,
            app,
            triggerName: 'log-trigger-event',
            triggerType: 'DATABASE',
            functionName: 'logTriggerEvent'
        })

        const documentId = new ObjectId('507f1f77bcf86cd799439011')
        const ownerId = new ObjectId('507f191e810c19729de860ea')

        await changeListeners.change({
            clusterTime: new Date(),
            operationType: 'insert',
            ns: { db: 'flowerbase-test', coll: 'activityLogs' },
            documentKey: { _id: documentId },
            fullDocument: {
                _id: documentId,
                ownerId
            }
        })

        expect(mockedGenerateContext).toHaveBeenCalledTimes(1)
        expect(mockedGenerateContext).toHaveBeenCalledWith(
            expect.objectContaining({
                deserializeArgs: false,
                args: [
                    expect.objectContaining({
                        documentKey: expect.objectContaining({
                            _id: expect.any(ObjectId)
                        }),
                        fullDocument: expect.objectContaining({
                            _id: expect.any(ObjectId),
                            ownerId: expect.any(ObjectId)
                        })
                    })
                ]
            })
        )

        const payload = mockedGenerateContext.mock.calls[0][0].args[0] as {
            documentKey: { _id: ObjectId }
            fullDocument: { _id: ObjectId; ownerId: ObjectId }
        }

        expect(payload.documentKey._id.toHexString()).toBe(documentId.toHexString())
        expect(payload.fullDocument._id.toHexString()).toBe(documentId.toHexString())
        expect(payload.fullDocument.ownerId.toHexString()).toBe(ownerId.toHexString())
    })
})