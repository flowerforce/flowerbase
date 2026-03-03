import Fastify, { FastifyInstance } from 'fastify'
import { registerCollectionRoutes } from '../collections'
import { StateManager } from '../../../state'

jest.mock('../../../state', () => ({
  StateManager: {
    select: jest.fn()
  }
}))

describe('monitoring collections routes', () => {
  let app: FastifyInstance
  let addCollectionHistory: jest.Mock
  let selectMock: jest.Mock
  let insertOne: jest.Mock
  let insertMany: jest.Mock

  beforeEach(async () => {
    app = Fastify()
    addCollectionHistory = jest.fn()
    selectMock = StateManager.select as unknown as jest.Mock
    insertOne = jest.fn()
    insertMany = jest.fn()

    const services = {
      'mongodb-atlas': jest.fn(() => ({
        db: jest.fn(() => ({
          collection: jest.fn(() => ({
            insertOne,
            insertMany
          }))
        }))
      }))
    }

    selectMock.mockImplementation((key: string) => {
      if (key === 'rules') return {}
      if (key === 'services') return services
      return {}
    })

    registerCollectionRoutes(app, {
      prefix: '/monit',
      collectionHistory: [],
      maxCollectionHistory: 20,
      addCollectionHistory
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    jest.clearAllMocks()
  })

  it('POST /collections/insert should insert one document', async () => {
    insertOne.mockResolvedValue({
      acknowledged: true,
      insertedId: 'id-1'
    })

    const response = await app.inject({
      method: 'POST',
      url: '/monit/api/collections/insert',
      payload: {
        collection: 'todos',
        mode: 'insertOne',
        document: { title: 'Task 1' },
        runAsSystem: true
      }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      mode: 'insertOne',
      acknowledged: true,
      insertedId: 'id-1',
      count: 1
    })
    expect(insertOne).toHaveBeenCalledWith({ title: 'Task 1' })
    expect(addCollectionHistory).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'todos',
      mode: 'insertOne',
      document: { title: 'Task 1' },
      runAsSystem: true,
      page: 1
    }))
  })

  it('POST /collections/insert should insert many documents', async () => {
    insertMany.mockResolvedValue({
      acknowledged: true,
      insertedIds: {
        0: 'id-1',
        1: 'id-2'
      }
    })

    const response = await app.inject({
      method: 'POST',
      url: '/monit/api/collections/insert',
      payload: {
        collection: 'todos',
        mode: 'insertMany',
        documents: [{ title: 'Task 1' }, { title: 'Task 2' }],
        runAsSystem: false
      }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      mode: 'insertMany',
      acknowledged: true,
      insertedCount: 2,
      insertedIds: ['id-1', 'id-2'],
      count: 2
    })
    expect(insertMany).toHaveBeenCalledWith([{ title: 'Task 1' }, { title: 'Task 2' }])
    expect(addCollectionHistory).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'todos',
      mode: 'insertMany',
      documents: [{ title: 'Task 1' }, { title: 'Task 2' }],
      runAsSystem: false,
      page: 1
    }))
  })

  it('POST /collections/insert should validate insertOne payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/monit/api/collections/insert',
      payload: {
        collection: 'todos',
        mode: 'insertOne',
        document: ['invalid']
      }
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Document must be an object'
    })
    expect(insertOne).not.toHaveBeenCalled()
  })

  it('POST /collections/insert should validate insertMany payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/monit/api/collections/insert',
      payload: {
        collection: 'todos',
        mode: 'insertMany',
        documents: [{ title: 'Task 1' }, 'invalid']
      }
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Every document must be an object'
    })
    expect(insertMany).not.toHaveBeenCalled()
  })
})
