import { BSON, Document, ObjectId, UpdateFilter } from 'mongodb'
import MongoDbAtlas from '..'
import { Rules } from '../../../features/rules/interface'
import { Role } from '../../../utils/roles/interface'

const createRole = (overrides: Partial<Role> = {}): Role => ({
  name: 'member',
  apply_when: {},
  insert: true,
  delete: true,
  search: true,
  read: true,
  write: true,
  ...overrides
})

const createOperators = (roles: Role[]) => {
  const insertedId = new ObjectId()
  const updateResult = {
    acknowledged: true,
    matchedCount: 0,
    modifiedCount: 0,
    upsertedCount: 1,
    upsertedId: insertedId
  }
  const collection = {
    collectionName: 'memberships',
    findOne: jest.fn().mockResolvedValue(null),
    insertOne: jest.fn().mockResolvedValue({ acknowledged: true, insertedId }),
    updateOne: jest.fn().mockResolvedValue(updateResult)
  }
  const app = {
    mongo: {
      client: {
        db: jest.fn().mockReturnValue({
          collection: jest.fn().mockReturnValue(collection)
        })
      }
    }
  }
  const rules = {
    memberships: { database: 'db', collection: 'memberships', filters: [], roles }
  } as Rules
  const operators = MongoDbAtlas(app as any, {
    rules,
    user: { id: 'user-1' }
  })
    .db('db')
    .collection('memberships')

  return { operators, collection, updateResult }
}

describe('mongodb-atlas updateOne upsert permissions', () => {
  it.each([
    ['insert and write are denied', { insert: false, write: false }],
    ['insert is denied despite write permission', { insert: false, write: true }],
    ['insert is denied with write unspecified', { insert: false, write: undefined }]
  ] as const)('rejects insertion when %s', async (_description, permissions) => {
    const { operators, collection } = createOperators([createRole(permissions)])

    await expect(
      operators.updateOne(
        { userId: 'user-1', accountId: 'other-account' },
        { $set: { role: 'admin' } },
        { upsert: true }
      )
    ).rejects.toThrow('Update not permitted')

    expect(collection.updateOne).not.toHaveBeenCalled()
  })

  it.each([
    ['denied', false],
    ['a non-matching expression', { '%%root.title': 'Approved membership' }]
  ] as const)(
    'rejects writable fields when insert permission is %s',
    async (_description, insert) => {
      const { operators, collection } = createOperators([
        createRole({
          insert,
          write: undefined,
          fields: {
            userId: { write: true },
            title: { write: true }
          }
        })
      ])

      await expect(
        operators.updateOne(
          { userId: 'user-1' },
          { $set: { title: 'Unapproved membership' } },
          { upsert: true }
        )
      ).rejects.toThrow('Update not permitted')

      expect(collection.updateOne).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['no role is configured', []],
    ['no role applies', [createRole({ apply_when: { '%%user.id': 'other-user' } })]]
  ] as const)('rejects insertion when %s', async (_description, roles) => {
    const { operators, collection } = createOperators([...roles])

    await expect(
      operators.updateOne(
        { userId: 'user-1' },
        { $set: { accountId: 'other-account', role: 'admin' } },
        { upsert: true }
      )
    ).rejects.toThrow('Update not permitted')

    expect(collection.updateOne).not.toHaveBeenCalled()
  })

  it.each(['$setOnInsert', 'query'] as const)(
    'rejects a forbidden field supplied through %s',
    async (source) => {
      const { operators, collection } = createOperators([
        createRole({
          write: undefined,
          fields: {
            userId: { write: true },
            title: { write: true },
            role: { write: false }
          }
        })
      ])
      const query = {
        userId: 'user-1',
        ...(source === 'query' ? { role: 'admin' } : {})
      }
      const update = {
        $set: { title: 'New membership' },
        ...(source === '$setOnInsert' ? { $setOnInsert: { role: 'admin' } } : {})
      }

      await expect(operators.updateOne(query, update, { upsert: true })).rejects.toThrow(
        'Update not permitted'
      )

      expect(collection.updateOne).not.toHaveBeenCalled()
    }
  )

  it.each(['equality', '$eq', '$and'] as const)(
    'validates the complete insertion candidate with query %s',
    async (queryType) => {
      const id = new ObjectId()
      const { operators, collection, updateResult } = createOperators([
        createRole({
          apply_when: {
            '%%root._id': { '%exists': true },
            '%%root.userId': 'user-1',
            '%%root.title': 'New membership',
            '%%root.createdBy': 'user-1'
          }
        })
      ])
      const query =
        queryType === '$and'
          ? { $and: [{ _id: id }, { userId: 'user-1' }] }
          : queryType === '$eq'
            ? { _id: { $eq: id }, userId: { $eq: 'user-1' } }
            : { _id: id, userId: 'user-1' }
      const update = {
        $set: { title: 'New membership' },
        $setOnInsert: { createdBy: 'user-1' }
      }
      const options = { upsert: true }

      await expect(operators.updateOne(query, update, options)).resolves.toEqual(
        updateResult
      )

      expect(collection.updateOne).not.toHaveBeenCalled()
      expect(collection.insertOne).toHaveBeenCalledWith(
        { _id: id, userId: 'user-1', title: 'New membership', createdBy: 'user-1' },
        {}
      )
    }
  )

  it('disables insertion after validating an existing document and preserves other options', async () => {
    const { operators, collection } = createOperators([
      createRole({ insert: false, write: true })
    ])
    const id = new ObjectId()
    const updateResult = { acknowledged: true, matchedCount: 0, upsertedCount: 0 }
    collection.findOne.mockResolvedValue({ _id: id, userId: 'user-1', title: 'Old' })
    // The document may disappear after permission validation, before the native update.
    collection.updateOne.mockResolvedValue(updateResult)
    const update = { $set: { title: 'Updated' } }
    const options = { upsert: true, comment: 'membership update', maxTimeMS: 500 }

    await expect(operators.updateOne({ _id: id }, update, options)).resolves.toEqual(
      updateResult
    )

    expect(collection.updateOne).toHaveBeenCalledWith(
      { $and: [{ _id: id }, { _id: id }] },
      update,
      {
        ...options,
        upsert: false,
        collation: { locale: 'simple' }
      }
    )
    expect(options.upsert).toBe(true)
  })

  it.each(['$in', '$all'] as const)(
    'rejects an insertion candidate inferred from unsupported query %s',
    async (operator) => {
      const { operators, collection } = createOperators([createRole()])

      await expect(
        operators.updateOne(
          { userId: { [operator]: ['user-1'] } },
          { $set: { title: 'New membership' } },
          { upsert: true }
        )
      ).rejects.toThrow('Upsert filter cannot be validated')

      expect(collection.updateOne).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['$bit', { $bit: { permissions: { or: 1 } } }],
    ['$mul BSON overflow', { $mul: { counter: 2147483647 } }],
    [
      '$addToSet BSON equality',
      { $addToSet: { roles: { scope: 'account', role: 'member' } } }
    ],
    ['positional path', { $set: { 'members.$[member].role': 'admin' } }],
    ['bracket path', { $set: { 'member[role]': 'admin' } }],
    ['$push modifiers', { $push: { roles: { $each: ['admin'], $position: 0 } } }]
  ])('rejects an insertion with unsupported %s', async (_description, update) => {
    const { operators, collection } = createOperators([createRole()])

    await expect(
      operators.updateOne({ userId: 'user-1' }, update as UpdateFilter<Document>, {
        upsert: true
      })
    ).rejects.toThrow('cannot be validated')

    expect(collection.updateOne).not.toHaveBeenCalled()
  })

  it.each([
    ['direct value', { $set: { role: undefined } }],
    ['nested value', { $setOnInsert: { profile: { role: undefined } } }],
    ['symbol value', { $set: { role: Symbol('admin') } }],
    ['BSON symbol value', { $set: { role: new BSON.BSONSymbol('admin') } }]
  ])('rejects a %s that the driver would alter or omit', async (_description, update) => {
    const { operators, collection } = createOperators([createRole()])

    await expect(
      operators.updateOne({ role: 'admin' }, update, {
        upsert: true,
        ignoreUndefined: true
      })
    ).rejects.toThrow('Upsert value cannot be validated')

    expect(collection.updateOne).not.toHaveBeenCalled()
  })

  it('authorizes an insertion candidate computed with $inc and $setOnInsert', async () => {
    const { operators, collection, updateResult } = createOperators([
      createRole({
        apply_when: {
          '%%root.userId': 'user-1',
          '%%root.counter': 2,
          '%%root.createdBy': 'user-1'
        }
      })
    ])
    const query = { userId: 'user-1', counter: 1 }
    const update = { $inc: { counter: 1 }, $setOnInsert: { createdBy: 'user-1' } }
    const options = { upsert: true }

    await expect(operators.updateOne(query, update, options)).resolves.toEqual(
      updateResult
    )

    expect(collection.updateOne).not.toHaveBeenCalled()
    expect(collection.insertOne).toHaveBeenCalledWith(
      { userId: 'user-1', counter: 2, createdBy: 'user-1' },
      {}
    )
  })
})
