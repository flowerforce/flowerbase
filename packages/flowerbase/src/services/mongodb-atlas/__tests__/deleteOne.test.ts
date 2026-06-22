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

describe('mongodb-atlas deleteOne', () => {
  it('passes the transaction session to the permission pre-check read', async () => {
    const id = new ObjectId()
    const session = { id: 'txn-session' } as any
    const existingDoc = { _id: id, title: 'Old', userId: 'user-1' }
    const findOne = jest.fn().mockResolvedValue(existingDoc)
    const deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 })
    const collection = { collectionName: 'todos', findOne, deleteOne }

    const app = createAppWithCollection(collection)
    const operators = MongoDbAtlas(app as any, {
      rules: createRules(),
      user: { id: 'user-1' }
    })
      .db('db')
      .collection('todos')

    await operators.deleteOne({ _id: id }, { session })

    expect(findOne).toHaveBeenCalledWith({ $and: [{ _id: id }] }, { session })
  })
})
