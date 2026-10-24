import { Document, ObjectId } from 'mongodb'
import MongoDbAtlas from '..'
import { Rules } from '../../../features/rules/interface'
import { Role } from '../../../utils/roles/interface'

const role = (overrides: Partial<Role> = {}): Role => ({
  name: 'member',
  apply_when: {},
  read: true,
  write: true,
  insert: true,
  delete: true,
  ...overrides
})

const fixture = (roles: Role[], previous: Document[] = [], system = false) => {
  const insertedId = new ObjectId()
  const collection = {
    collectionName: 'memberships',
    findOne: jest.fn().mockResolvedValue(previous[0] ?? null),
    find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue(previous) }),
    aggregate: jest
      .fn()
      .mockReturnValue({ toArray: jest.fn().mockResolvedValue(previous) }),
    insertOne: jest.fn().mockResolvedValue({ acknowledged: true, insertedId }),
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true, matchedCount: 1 }),
    updateMany: jest
      .fn()
      .mockResolvedValue({ acknowledged: true, matchedCount: previous.length }),
    findOneAndUpdate: jest.fn().mockResolvedValue(previous[0] ?? null)
  }
  const app = {
    mongo: {
      client: {
        db: jest
          .fn()
          .mockReturnValue({ collection: jest.fn().mockReturnValue(collection) })
      }
    }
  }
  const rules = {
    memberships: { database: 'db', collection: 'memberships', filters: [], roles }
  } as Rules
  const operators = MongoDbAtlas(app as any, {
    rules,
    user: { id: 'user-1' },
    run_as_system: system
  })
    .db('db')
    .collection('memberships')
  return { operators, collection, insertedId }
}

const methods = ['updateOne', 'findOneAndUpdate', 'updateMany'] as const

describe('mongodb-atlas write authorization', () => {
  it.each(['findOneAndUpdate', 'updateMany'] as const)(
    '%s chooses its role from the stored document before the attacker changes ownership',
    async (method) => {
      const previous = { _id: new ObjectId(), owner: 'other-user', title: 'Private' }
      const { operators, collection } = fixture(
        [
          role({ apply_when: { '%%root.owner': 'user-1' } }),
          role({ name: 'other', write: false })
        ],
        [previous]
      )
      await expect(operators[method]({}, { $set: { owner: 'user-1' } })).rejects.toThrow(
        'Update not permitted'
      )
      expect(collection[method]).not.toHaveBeenCalled()
    }
  )

  describe.each(methods)('%s protected fields', (method) => {
    it.each([
      ['$unset', { $unset: { privilege: '' } }],
      ['$rename source', { $rename: { privilege: 'title' } }],
      ['$rename destination', { $rename: { title: 'privilege' } }],
      ['$unset nested path', { $unset: { 'privilege.admin': '' } }]
    ])('rejects %s without explicit write permission', async (_description, update) => {
      const previous = {
        _id: new ObjectId(),
        title: 'Member',
        privilege: { admin: true }
      }
      const { operators, collection } = fixture(
        [
          role({
            write: undefined,
            fields: {
              _id: { read: true },
              title: { write: true },
              privilege: { write: false }
            }
          })
        ],
        [previous]
      )
      await expect(operators[method]({}, update)).rejects.toThrow('Update not permitted')
      expect(collection[method]).not.toHaveBeenCalled()
    })

    it('permits unsetting and renaming explicitly writable fields', async () => {
      const previous = { _id: new ObjectId(), title: 'Member', removable: 'old' }
      const { operators, collection } = fixture(
        [
          role({
            write: undefined,
            fields: {
              _id: { read: true },
              title: { write: true },
              renamed: { write: true },
              removable: { write: true }
            }
          })
        ],
        [previous]
      )
      await operators[method](
        {},
        { $rename: { title: 'renamed' }, $unset: { removable: '' } }
      )
      expect(collection[method]).toHaveBeenCalledTimes(1)
    })

    it('evaluates field permission expressions on the final document', async () => {
      const previous = { _id: new ObjectId(), title: 'Member', removable: true }
      const { operators, collection } = fixture(
        [
          role({
            write: undefined,
            fields: {
              _id: { read: true },
              title: { write: true },
              removable: { write: { '%%root.removable': { '%exists': false } } }
            }
          })
        ],
        [previous]
      )
      await operators[method]({}, { $unset: { removable: '' } })
      expect(collection[method]).toHaveBeenCalledTimes(1)
    })

    it('uses additional_fields write rules for removed fields', async () => {
      const previous = { _id: new ObjectId(), title: 'Member', privateField: true }
      const { operators, collection } = fixture(
        [
          role({
            write: undefined,
            fields: { _id: { read: true }, title: { write: true } },
            additional_fields: { write: false }
          })
        ],
        [previous]
      )
      await expect(
        operators[method]({}, { $unset: { privateField: '' } })
      ).rejects.toThrow('Update not permitted')
      expect(collection[method]).not.toHaveBeenCalled()
    })
  })

  it.each(methods)(
    '%s pins existing-document writes and disables upsert',
    async (method) => {
      const previous = { _id: new ObjectId(), owner: 'user-1', title: 'Before' }
      const { operators, collection } = fixture([role({ insert: false })], [previous])
      await operators[method](
        { owner: 'user-1' },
        { $set: { title: 'After' } },
        { upsert: true }
      )
      expect(collection[method]).toHaveBeenCalledWith(
        { $and: [{ owner: 'user-1' }, { _id: previous._id }] },
        { $set: { title: 'After' } },
        { upsert: false, collation: { locale: 'simple' } }
      )
      expect(collection.insertOne).not.toHaveBeenCalled()
    }
  )

  it('pins updateMany to all authorized ids instead of the original broad query', async () => {
    const previous = [
      { _id: new ObjectId(), owner: 'user-1' },
      { _id: new ObjectId(), owner: 'user-1' }
    ]
    const { operators, collection } = fixture([role()], previous)
    await operators.updateMany({ owner: 'user-1' }, { $set: { title: 'After' } })
    expect(collection.updateMany).toHaveBeenCalledWith(
      { $and: [{ owner: 'user-1' }, { _id: { $in: previous.map((doc) => doc._id) } }] },
      { $set: { title: 'After' } },
      { collation: { locale: 'simple' } }
    )
  })

  it('an empty updateMany stays empty even if a new document appears after the read', async () => {
    const { operators, collection } = fixture([role()])
    await operators.updateMany({}, { $set: { title: 'After' } })
    expect(collection.updateMany).toHaveBeenCalledWith(
      { $and: [{ _id: { $in: [] } }] },
      { $set: { title: 'After' } },
      { collation: { locale: 'simple' } }
    )
  })

  it('preserves findOneAndUpdate sort while keeping permission comparisons binary', async () => {
    const permitted = { _id: new ObjectId(), owner: 'user-1', rank: 1 }
    const denied = { _id: new ObjectId(), owner: 'other-user', rank: 2 }
    const { operators, collection } = fixture(
      [
        role({ apply_when: { '%%root.owner': 'user-1' } }),
        role({ name: 'other', write: false })
      ],
      [permitted]
    )
    collection.findOne.mockImplementation(async (_query, options) =>
      options?.sort ? denied : permitted
    )
    await expect(
      operators.findOneAndUpdate(
        {},
        { $set: { title: 'After' } },
        {
          sort: { rank: -1 },
          collation: { locale: 'en', strength: 1 }
        }
      )
    ).rejects.toThrow('Update not permitted')
    expect(collection.findOne).toHaveBeenCalledWith(
      {},
      {
        sort: { rank: -1 },
        collation: { locale: 'simple' }
      }
    )
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it.each(methods)('%s retains explicit system execution', async (method) => {
    const { operators, collection } = fixture([], [], true)
    const query = { owner: 'other-user' }
    await operators[method](query, { $unset: { privilege: '' } }, { upsert: true })
    expect(collection[method]).toHaveBeenCalledWith(
      query,
      { $unset: { privilege: '' } },
      { upsert: true }
    )
    expect(collection.findOne).not.toHaveBeenCalled()
    expect(collection.find).not.toHaveBeenCalled()
  })
})

describe('mongodb-atlas findOneAndUpdate pipelines', () => {
  it.each([
    ['$out', [{ $out: 'memberships' }]],
    ['$merge', [{ $set: { title: 'After' } }, { $merge: 'memberships' }]],
    ['$lookup', [{ $lookup: { from: 'secrets', as: 'stolen', pipeline: [] } }]],
    [
      'multiple operators in one stage',
      [{ $set: { title: 'After' }, $out: 'memberships' }]
    ]
  ])(
    'rejects %s before any native aggregate execution',
    async (_description, pipeline) => {
      const { operators, collection } = fixture(
        [role()],
        [{ _id: new ObjectId(), title: 'Before' }]
      )
      await expect(operators.findOneAndUpdate({}, pipeline)).rejects.toThrow(
        'Update pipeline stage not permitted'
      )
      expect(collection.aggregate).not.toHaveBeenCalled()
      expect(collection.findOneAndUpdate).not.toHaveBeenCalled()
    }
  )

  it('rejects a denied pre-update role before running a pipeline', async () => {
    const { operators, collection } = fixture(
      [role({ write: false })],
      [{ _id: new ObjectId() }]
    )
    await expect(
      operators.findOneAndUpdate({}, [{ $set: { owner: 'user-1' } }])
    ).rejects.toThrow('Update not permitted')
    expect(collection.aggregate).not.toHaveBeenCalled()
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('checks the final pipeline document with the original role', async () => {
    const previous = { _id: new ObjectId(), owner: 'user-1', privilege: false }
    const updated = { ...previous, owner: 'other-user', privilege: true }
    const { operators, collection } = fixture(
      [
        role({
          apply_when: { '%%root.owner': 'user-1' },
          write: { '%%root.privilege': false }
        }),
        role({ name: 'other' })
      ],
      [previous]
    )
    collection.aggregate.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([updated])
    })
    await expect(
      operators.findOneAndUpdate({}, [{ $set: { owner: 'other-user', privilege: true } }])
    ).rejects.toThrow('Update not permitted')
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('rejects pipeline removal of a protected field', async () => {
    const previous = { _id: new ObjectId(), title: 'Before', privilege: true }
    const { operators, collection } = fixture(
      [
        role({
          write: undefined,
          fields: {
            _id: { read: true },
            title: { write: true },
            privilege: { write: false }
          }
        })
      ],
      [previous]
    )
    collection.aggregate.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([{ _id: previous._id, title: 'Before' }])
    })
    await expect(
      operators.findOneAndUpdate({}, [{ $unset: 'privilege' }])
    ).rejects.toThrow('Update not permitted')
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled()
  })

  it('computes and writes a lawful pipeline on the same selected id with binary collation', async () => {
    const previous = { _id: new ObjectId(), owner: 'user-1', title: 'Before' }
    const updated = { ...previous, title: 'After' }
    const { operators, collection } = fixture([role()], [previous])
    collection.aggregate.mockReturnValue({
      toArray: jest.fn().mockResolvedValue([updated])
    })
    collection.findOneAndUpdate.mockResolvedValue(updated)
    const query = { owner: 'user-1' }
    const pipeline = [{ $set: { title: 'After' } }]
    const options = {
      sort: { title: 1 as const },
      collation: { locale: 'en', strength: 1 },
      returnDocument: 'after' as const
    }
    await expect(operators.findOneAndUpdate(query, pipeline, options)).resolves.toEqual(
      updated
    )
    const pinned = { $and: [query, { _id: previous._id }] }
    expect(collection.aggregate).toHaveBeenCalledWith(
      [{ $match: pinned }, { $limit: 1 }, ...pipeline],
      { collation: { locale: 'simple' }, session: undefined, let: undefined }
    )
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(pinned, pipeline, {
      ...options, collation: { locale: 'simple' }
    })
  })
})

describe.each(methods)('mongodb-atlas %s upsert security', (method) => {
  it.each(['query', '$setOnInsert'] as const)(
    'validates forbidden fields originating from %s',
    async (source) => {
      const { operators, collection } = fixture([
        role({
          write: undefined,
          fields: {
            owner: { write: true },
            title: { write: true },
            privilege: { write: false }
          }
        })
      ])
      const query = {
        owner: 'user-1',
        ...(source === 'query' ? { privilege: true } : {})
      }
      const update = {
        $set: { title: 'After' },
        ...(source === '$setOnInsert' ? { $setOnInsert: { privilege: true } } : {})
      }
      await expect(operators[method](query, update, { upsert: true })).rejects.toThrow(
        'Update not permitted'
      )
      expect(collection.insertOne).not.toHaveBeenCalled()
      expect(collection[method]).not.toHaveBeenCalled()
    }
  )

  it('rejects insert:false even with writable fields', async () => {
    const { operators, collection } = fixture([
      role({
        write: undefined,
        insert: false,
        fields: { title: { write: true } }
      })
    ])
    await expect(
      operators[method]({}, { $set: { title: 'After' } }, { upsert: true })
    ).rejects.toThrow('Update not permitted')
    expect(collection.insertOne).not.toHaveBeenCalled()
    expect(collection[method]).not.toHaveBeenCalled()
  })

  it('inserts only the complete authorized candidate without reusing a broad upsert filter', async () => {
    const { operators, collection, insertedId } = fixture([
      role({
        apply_when: {
          '%%root.owner': 'user-1',
          '%%root.title': 'After',
          '%%root.createdBy': 'user-1'
        }
      })
    ])
    const query = { owner: 'user-1' }
    const update = { $set: { title: 'After' }, $setOnInsert: { createdBy: 'user-1' } }
    const result = await operators[method](query, update, { upsert: true })
    expect(collection.insertOne).toHaveBeenCalledWith(
      { owner: 'user-1', title: 'After', createdBy: 'user-1' },
      {}
    )
    expect(collection[method]).not.toHaveBeenCalled()
    expect(result).toEqual(
      method === 'findOneAndUpdate'
        ? null
        : {
            acknowledged: true,
            matchedCount: 0,
            modifiedCount: 0,
            upsertedCount: 1,
            upsertedId: insertedId
          }
    )
  })

  it('propagates an insert collision without updating the newly appearing document', async () => {
    const { operators, collection } = fixture([role()])
    const collision = Object.assign(new Error('duplicate _id'), { code: 11000 })
    collection.insertOne.mockRejectedValue(collision)
    await expect(
      operators[method](
        { _id: new ObjectId() },
        { $set: { title: 'After' } },
        { upsert: true }
      )
    ).rejects.toBe(collision)
    expect(collection[method]).not.toHaveBeenCalled()
  })
})
