import MongoDbAtlas from '..'
import { ObjectId } from 'mongodb'
import { createCacheProvider } from '../../../cache'
import { Rules } from '../../../features/rules/interface'
import { StateManager } from '../../../state'

const createAppWithCollection = (collection: Record<string, unknown>) => ({
  mongo: {
    client: {
      db: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue(collection)
      })
    }
  }
})

const createRules = (overrides?: Partial<Rules[keyof Rules]>): Rules => ({
  todos: {
    database: 'db',
    collection: 'todos',
    filters: overrides?.filters ?? [],
    roles: overrides?.roles ?? [
      {
        name: 'reader',
        apply_when: {},
        insert: true,
        delete: true,
        search: true,
        read: true,
        write: true
      }
    ],
    ...overrides
  }
})

describe('mongodb-atlas cache', () => {
  beforeEach(async () => {
    StateManager.setData('cache', await createCacheProvider({ provider: 'memory' }))
  })

  afterEach(async () => {
    await StateManager.select('cache').close()
    StateManager.setData('cache', await createCacheProvider())
  })

  it('caches count results and invalidates them after updateOne', async () => {
    const countDocuments = jest
      .fn()
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(9)
    const updateOne = jest.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1
    })
    const collection = {
      collectionName: 'todos',
      countDocuments,
      updateOne
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      run_as_system: true
    }).db('db').collection('todos')

    expect(await operators.count({ workspace: 'a' })).toBe(5)
    expect(await operators.count({ workspace: 'a' })).toBe(5)
    expect(countDocuments).toHaveBeenCalledTimes(1)

    await operators.updateOne({ workspace: 'a' }, { $set: { label: 'updated' } })

    expect(await operators.count({ workspace: 'a' })).toBe(9)
    expect(countDocuments).toHaveBeenCalledTimes(2)
  })

  it('caches findOne results for identical reads', async () => {
    const id = new ObjectId()
    const findOne = jest
      .fn()
      .mockResolvedValueOnce({ _id: id, label: 'first' })
    const collection = {
      collectionName: 'todos',
      findOne
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      run_as_system: true
    }).db('db').collection('todos')

    expect(await operators.findOne({ _id: id })).toEqual({
      _id: id,
      label: 'first'
    })
    expect(await operators.findOne({ _id: id })).toEqual({
      _id: id,
      label: 'first'
    })
    expect(findOne).toHaveBeenCalledTimes(1)
  })

  it('does not serve cached findOne values across different role visibility', async () => {
    const id = new ObjectId()
    const findOne = jest.fn().mockResolvedValue({ _id: id, ownerId: 'user-1', secret: 'top' })
    const collection = {
      collectionName: 'todos',
      findOne
    }

    const allowedOperators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    expect(await allowedOperators.findOne({ _id: id })).toEqual({
      _id: id,
      ownerId: 'user-1',
      secret: 'top'
    })
    expect(findOne).toHaveBeenCalledTimes(1)

    const hiddenOperators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules({
        roles: []
      }),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    expect(await hiddenOperators.findOne({ _id: id })).toEqual({})
    expect(findOne).toHaveBeenCalledTimes(1)
  })

  it('invalidates the shared authorization context', async () => {
    const countDocuments = jest
      .fn()
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(11)
    const updateOne = jest.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1
    })
    const findOne = jest.fn().mockResolvedValue({
      _id: new ObjectId(),
      ownerId: 'user-1',
      label: 'before'
    })
    const collection = {
      collectionName: 'todos',
      countDocuments,
      updateOne,
      findOne
    }

    const firstUserOperators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    const secondUserOperators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-2' }
    }).db('db').collection('todos')

    expect(await firstUserOperators.count({ workspace: 'a' })).toBe(5)
    expect(await secondUserOperators.count({ workspace: 'a' })).toBe(7)
    expect(countDocuments).toHaveBeenCalledTimes(2)

    await firstUserOperators.updateOne(
      { ownerId: 'user-1' },
      { $set: { label: 'updated' } }
    )

    expect(await firstUserOperators.count({ workspace: 'a' })).toBe(9)
    expect(await secondUserOperators.count({ workspace: 'a' })).toBe(11)
    expect(countDocuments).toHaveBeenCalledTimes(4)
  })
})
