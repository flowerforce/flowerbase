import MongoDbAtlas from '..'
import { Rules } from '../../../features/rules/interface'

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

describe('mongodb-atlas count', () => {
  it('applies formatted query for RBAC before counting', async () => {
    const countDocuments = jest.fn().mockResolvedValue(7)
    const collection = {
      collectionName: 'todos',
      countDocuments
    }

    const rules = {
      filters: [
        {
          name: 'ownerFilter',
          query: { ownerId: 'user-1' },
          apply_when: {}
        }
      ]
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(rules),
      user: { id: 'user-1' }
    })
      .db('db')
      .collection('todos')

    const result = await operators.count({ workspace: 'workspace-1' })

    expect(result).toBe(7)
    expect(countDocuments).toHaveBeenCalledWith(
      { $and: [{ ownerId: 'user-1' }, { workspace: 'workspace-1' }] },
      undefined
    )
  })

  it('delegates directly when running as system', async () => {
    const countDocuments = jest.fn().mockResolvedValue(42)
    const collection = {
      collectionName: 'todos',
      countDocuments
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      run_as_system: true
    })
      .db('db')
      .collection('todos')

    const options = { maxTimeMS: 500 }
    const result = await operators.count({ workspace: 'workspace-2' }, options)

    expect(result).toBe(42)
    expect(countDocuments).toHaveBeenCalledWith({ workspace: 'workspace-2' }, options)
  })

  it('supports countDocuments alias with RBAC filtering', async () => {
    const countDocuments = jest.fn().mockResolvedValue(3)
    const collection = {
      collectionName: 'todos',
      countDocuments
    }

    const rules = {
      filters: [
        {
          name: 'ownerFilter',
          query: { ownerId: 'user-1' },
          apply_when: {}
        }
      ]
    }

    const operators = MongoDbAtlas(createAppWithCollection(collection) as any, {
      rules: createRules(rules),
      user: { id: 'user-1' }
    })
      .db('db')
      .collection('todos')

    const result = await operators.countDocuments({ workspace: 'workspace-1' })

    expect(result).toBe(3)
    expect(countDocuments).toHaveBeenCalledWith(
      { $and: [{ ownerId: 'user-1' }, { workspace: 'workspace-1' }] },
      undefined
    )
  })
})
