import Fastify from 'fastify'
import { EventEmitter } from 'node:events'
import { ObjectId } from 'mongodb'
import { GenerateContext } from '../../../utils/context'
import { StateManager } from '../../../state'
import { registerTriggerLifecycle, TRIGGER_HANDLERS } from '../utils'

jest.mock('../../../utils/context', () => ({ GenerateContext: jest.fn() }))
jest.mock('../../../state', () => ({ StateManager: { select: jest.fn() } }))
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const options = (app: any) => ({
  app,
  config: {
    database: 'test',
    collection: 'records',
    operation_types: ['insert'],
    match: {},
    project: {}
  } as any,
  triggerHandler: {} as any,
  functionsList: {} as any,
  services: {} as any,
  triggerName: 'lifecycle',
  triggerType: 'DATABASE' as const,
  functionName: 'handle'
})

describe('trigger shutdown lifecycle', () => {
  beforeEach(() => {
    jest.mocked(GenerateContext).mockReset()
    jest.mocked(StateManager.select).mockReset()
  })
  it('closes streams and awaits in-flight handlers before closing MongoDB', async () => {
    const app = Fastify()
    const running = deferred(),
      finish = deferred(),
      streamClosed = deferred()
    const stream = Object.assign(new EventEmitter(), {
      close: jest.fn(async () => {
        streamClosed.resolve()
      })
    })
    app.decorate('mongo', {
      changestream: {
        client: { db: () => ({ collection: () => ({ watch: () => stream }) }) }
      }
    } as any)
    let completed = false
    jest.mocked(GenerateContext).mockImplementation(async () => {
      running.resolve()
      await finish.promise
      completed = true
    })
    const closeDatabase = jest.fn(async () => {
      expect(completed).toBe(true)
    })
    app.addHook('onClose', closeDatabase)
    registerTriggerLifecycle(app)
    await app.ready()
    // Trigger activation happens after Fastify is ready; lifecycle hooks were registered earlier.
    await TRIGGER_HANDLERS.DATABASE(options(app))
    stream.emit('change', {
      operationType: 'insert',
      documentKey: { _id: new ObjectId() },
      fullDocument: {}
    })
    await running.promise
    const closing = app.close()
    await streamClosed.promise
    expect(closeDatabase).not.toHaveBeenCalled()
    stream.emit('change', {
      operationType: 'insert',
      documentKey: { _id: new ObjectId() },
      fullDocument: {}
    })
    finish.resolve()
    await closing
    expect(closeDatabase).toHaveBeenCalledTimes(1)
    expect(GenerateContext).toHaveBeenCalledTimes(1)
  })
  it('reports authentication trigger lookup failures without an unhandled rejection', async () => {
    const app = Fastify()
    const failure = new Error('Mongo command failed')
    const reported = deferred()
    const addEvent = jest.fn(() => reported.resolve())
    jest.mocked(StateManager.select).mockReturnValue({ addEvent } as any)
    const stream = Object.assign(new EventEmitter(), { close: jest.fn(async () => {}) })
    const findOneAndUpdate = jest.fn().mockRejectedValue(failure)
    app.decorate('mongo', {
      changestream: {
        client: {
          db: () => ({ collection: () => ({ watch: () => stream, findOneAndUpdate }) })
        }
      }
    } as any)
    registerTriggerLifecycle(app)
    await app.ready()
    await TRIGGER_HANDLERS.AUTHENTICATION({
      ...options(app),
      triggerType: 'AUTHENTICATION'
    })
    const id = new ObjectId()
    stream.emit('change', {
      operationType: 'insert',
      documentKey: { _id: id },
      fullDocument: { _id: id, status: 'confirmed' }
    })
    await reported.promise
    await app.close()
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1)
    expect(addEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }))
    expect(GenerateContext).not.toHaveBeenCalled()
  })
})
