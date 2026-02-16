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
})
