import { Document, ObjectId } from 'mongodb'
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

describe('mongodb-atlas findOneAndUpdate', () => {
  it('applies write/read validation and returns the updated document', async () => {
    const id = new ObjectId()
    const existingDoc = { _id: id, title: 'Old', userId: 'user-1' }
    const updatedDoc = { _id: id, title: 'New', userId: 'user-1' }
    const findOne = jest.fn().mockResolvedValue(existingDoc)
    const aggregate = jest.fn().mockReturnValue({
      toArray: jest.fn().mockResolvedValue([updatedDoc])
    })
    const findOneAndUpdate = jest.fn().mockResolvedValue(updatedDoc)
    const collection = {
      collectionName: 'todos',
      findOne,
      aggregate,
      findOneAndUpdate
    }

    const app = createAppWithCollection(collection)
    const operators = MongoDbAtlas(app as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    })
      .db('db')
      .collection('todos')

    const result = await operators.findOneAndUpdate({ _id: id }, { $set: { title: 'New' } })

    expect(findOne).toHaveBeenCalled()
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { $and: [{ _id: id }] },
      { $set: { title: 'New' } }
    )
    expect(result).toEqual(updatedDoc)
  })

  it('rejects updates when write permission is denied', async () => {
    const id = new ObjectId()
    const existingDoc = { _id: id, title: 'Old', userId: 'user-1' }
    const findOne = jest.fn().mockResolvedValue(existingDoc)
    const findOneAndUpdate = jest.fn()
    const collection = {
      collectionName: 'todos',
      findOne,
      findOneAndUpdate
    }

    const app = createAppWithCollection(collection)
    const operators = MongoDbAtlas(app as any, {
      rules: createRules({ write: false }),
      user: { id: 'user-1' }
    })
      .db('db')
      .collection('todos')

    await expect(
      operators.findOneAndUpdate({ _id: id }, { title: 'Denied' } as Document)
    ).rejects.toThrow('Update not permitted')
    expect(findOneAndUpdate).not.toHaveBeenCalled()
  })
})
