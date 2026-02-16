import { ObjectId } from 'mongodb'
import MongoDbAtlas from '..'
import { Role, Rules } from '../../../features/rules/interface'

const createAppWithCollection = (collection: Record<string, unknown>) => ({
  mongo: {
    client: {
      db: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue(collection)
      })
    }
  }
})

const createRules = (roleOverrides: Partial<Role> = {}): Rules => ({
  todos: {
    database: 'db',
    collection: 'todos',
    filters: [],
    roles: [
      {
        name: 'owner',
        apply_when: {},
        insert: true,
        delete: true,
        search: true,
        read: true,
        write: true,
        ...roleOverrides
      }
    ]
  }
})

describe('mongodb-atlas Realm compatibility', () => {
  it('allows updateOne upsert when no document matches', async () => {
    const updateResult = { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }
    const id = new ObjectId()
    const findOne = jest.fn().mockResolvedValue(null)
    const updateOne = jest.fn().mockResolvedValue(updateResult)
    const collection = {
      collectionName: 'todos',
      findOne,
      updateOne
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    const result = await operators.updateOne(
      { _id: id },
      { $set: { label: 'created-by-upsert' } },
      { upsert: true }
    )

    expect(result).toEqual(updateResult)
    expect(updateOne).toHaveBeenCalledWith(
      { $and: [{ _id: id }] },
      { $set: { label: 'created-by-upsert' } },
      { upsert: true }
    )
  })

  it('accepts plain documents in updateOne by normalizing them to $set', async () => {
    const updateResult = { acknowledged: true, matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }
    const id = new ObjectId()
    const findOne = jest.fn().mockResolvedValue({ _id: id, label: 'before' })
    const aggregate = jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([{ _id: id, label: 'after', count: 5 }])
    })
    const updateOne = jest.fn().mockResolvedValue(updateResult)
    const collection = {
      collectionName: 'todos',
      findOne,
      aggregate,
      updateOne
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    const replacementLikePayload = { label: 'after', count: 5 }
    const result = await operators.updateOne({ _id: id }, replacementLikePayload)

    expect(result).toEqual(updateResult)
    expect(updateOne).toHaveBeenCalledWith(
      { $and: [{ _id: id }] },
      { $set: replacementLikePayload },
      undefined
    )
  })

  it('supports $inc in updateOne without using invalid aggregate stages', async () => {
    const id = new ObjectId()
    const findOne = jest.fn().mockResolvedValue({ _id: id, count: 1 })
    const aggregate = jest.fn(() => {
      throw new Error('aggregate should not be used for operator simulation')
    })
    const updateOne = jest.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1
    })
    const collection = {
      collectionName: 'todos',
      findOne,
      aggregate,
      updateOne
    }
    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    await operators.updateOne({ _id: id }, { $inc: { count: 1 } })

    expect(updateOne).toHaveBeenCalledWith(
      { $and: [{ _id: id }] },
      { $inc: { count: 1 } },
      undefined
    )
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('supports $push in findOneAndUpdate without treating it as a pipeline stage', async () => {
    const id = new ObjectId()
    const findOne = jest.fn().mockResolvedValue({ _id: id, tags: ['old'] })
    const aggregate = jest.fn(() => {
      throw new Error('aggregate should not be used for operator simulation')
    })
    const findOneAndUpdate = jest.fn().mockResolvedValue({ _id: id, tags: ['old', 'new'] })
    const collection = {
      collectionName: 'todos',
      findOne,
      aggregate,
      findOneAndUpdate
    }
    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    await operators.findOneAndUpdate({ _id: id }, { $push: { tags: 'new' } })

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { $and: [{ _id: id }] },
      { $push: { tags: 'new' } }
    )
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('supports operator updates in updateMany without using invalid aggregate stages', async () => {
    const id = new ObjectId()
    const find = jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([{ _id: id, tags: ['old'] }])
    })
    const aggregate = jest.fn(() => {
      throw new Error('aggregate should not be used for operator simulation')
    })
    const updateMany = jest.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1
    })
    const collection = {
      collectionName: 'todos',
      find,
      aggregate,
      updateMany
    }
    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    }).db('db').collection('todos')

    await operators.updateMany({ _id: id }, { $push: { tags: 'new' } })

    expect(updateMany).toHaveBeenCalledWith(
      { $and: [{ _id: id }] },
      { $push: { tags: 'new' } },
      undefined
    )
    expect(aggregate).not.toHaveBeenCalled()
  })

  it('treats findOne second argument as options when it matches option keys', async () => {
    const findOne = jest.fn().mockResolvedValue({ _id: new ObjectId() })
    const collection = {
      collectionName: 'todos',
      findOne
    }
    const session = { id: 'tx-1' }
    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      run_as_system: true
    }).db('db').collection('todos')

    await operators.findOne({ key: 'value' }, { session } as any)

    expect(findOne).toHaveBeenCalledWith({ key: 'value' }, { session })
  })

  it('treats find second argument as options when it matches option keys', async () => {
    const cursor = {
      toArray: jest.fn().mockResolvedValue([]),
      sort: jest.fn(),
      skip: jest.fn(),
      limit: jest.fn()
    }
    const find = jest.fn().mockReturnValue(cursor)
    const collection = {
      collectionName: 'todos',
      find
    }
    const session = { id: 'tx-2' }
    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      run_as_system: true
    }).db('db').collection('todos')

    operators.find({ active: true }, { session } as any)

    expect(find).toHaveBeenCalledWith({ active: true }, { session })
  })

  it('returns insertMany insertedIds as an array', async () => {
    const id0 = new ObjectId()
    const id1 = new ObjectId()
    const insertMany = jest.fn().mockResolvedValue({
      acknowledged: true,
      insertedCount: 2,
      insertedIds: { 0: id0, 1: id1 }
    })
    const collection = {
      collectionName: 'todos',
      insertMany
    }
    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      run_as_system: true
    }).db('db').collection('todos')

    const result = await operators.insertMany([{ a: 1 }, { a: 2 }])

    expect(result.insertedIds).toEqual([id0, id1])
  })

  it('exposes startSession and delegates to the underlying MongoClient', async () => {
    const mockSession = { withTransaction: jest.fn() }
    const startSession = jest.fn().mockReturnValue(mockSession)
    const app = {
      mongo: {
        client: {
          startSession,
          db: jest.fn().mockReturnValue({
            collection: jest.fn().mockReturnValue({
              collectionName: 'todos'
            })
          })
        }
      }
    }

    const service = MongoDbAtlas(app as any, {
      run_as_system: true
    })
    const options = { causalConsistency: true }
    const session = service.startSession(options as any)

    expect(startSession).toHaveBeenCalledWith(options)
    expect(session).toBe(mockSession)
  })
})
