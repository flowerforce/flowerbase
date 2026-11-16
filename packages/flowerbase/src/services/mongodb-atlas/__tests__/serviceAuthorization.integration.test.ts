import fastify, { FastifyInstance } from 'fastify'
import { Collection, Document, MongoClient, ObjectId } from 'mongodb'
import { services } from '../../../services'
import MongoDbAtlas from '..'
import { Rules } from '../../../features/rules/interface'
import { Role } from '../../../utils/roles/interface'
import { registerPlugins } from '../../../utils/initializer/registerPlugins'
import { GenerateContext } from '../../../utils/context'

const uri = process.env.FLOWERBASE_TEST_MONGO_URI
const integration = uri ? describe : describe.skip
const user = { id: 'owner', custom_data: { role: 'owner' } }
const reader = (overrides: Partial<Role> = {}): Role => ({
  name: 'owner',
  apply_when: { '%%root.owner': '%%user.id' },
  read: true,
  fields: { secret: { read: false } },
  ...overrides
})

integration('Flowerbase service authorization on MongoDB', () => {
  let app: FastifyInstance
  let raw: MongoClient
  const dbName = `flowerbase_service_security_${new ObjectId().toHexString()}`
  const config = (roles: Role[], collName = 'records'): Rules =>
    ({
      [collName]: { database: dbName, collection: collName, filters: [], roles }
    }) as Rules
  const service = (
    roles: Role[] = [reader()],
    currentUser = user,
    collName = 'records'
  ) =>
    MongoDbAtlas(app, {
      rules: config(roles, collName),
      user: currentUser
    })
      .db(dbName)
      .collection(collName)
  const aggregate = (roles: Role[], pipeline: Document[] = [], currentUser = user) =>
    service(roles, currentUser).aggregate(pipeline, undefined, true).toArray()

  beforeAll(async () => {
    raw = await MongoClient.connect(uri!)
    app = fastify()
    await registerPlugins({
      register: app.register.bind(app),
      mongodbUrl: uri!,
      jwtSecret: 'service-authorization-test',
      functionsList: {}
    })
    await app.ready()
  })
  afterAll(async () => {
    await raw?.db(dbName).dropDatabase()
    await app?.close()
    await raw?.close()
  })
  beforeEach(async () => {
    const collection = app.mongo.client.db(dbName).collection('records')
    await collection.deleteMany({})
    await collection.insertMany([
      { owner: 'owner', title: 'Allowed', secret: 'hidden', note: 'visible' },
      { owner: 'other', title: 'Denied', secret: 'foreign', note: 'foreign' }
    ])
  })

  it('runs the complete Flowerbase pipeline before caller transformations', async () => {
    expect(
      await service()
        .aggregate(
          [{ $project: { _id: 0, title: 1, stolen: '$secret', note: 1 } }],
          undefined,
          true
        )
        .toArray()
    ).toEqual([{ title: 'Allowed', note: 'visible' }])
  })

  it('counts only authorized documents', async () => {
    expect(await service().countDocuments({})).toBe(1)
    expect(await service().countDocuments({ secret: 'hidden' })).toBe(0)
    expect(await service().countDocuments({}, { skip: 1 })).toBe(0)
    expect(await service().countDocuments({}, { limit: 1 })).toBe(1)
    expect(
      await aggregate([reader()], [{ $group: { _id: '$secret', total: { $sum: 1 } } }])
    ).toEqual([{ _id: null, total: 1 }])
  })

  it('applies caller predicates after document authorization and field masking', async () => {
    expect(await service().countDocuments({ note: 'visible' })).toBe(1)
    expect(await service().countDocuments({ note: 'foreign' })).toBe(0)
    expect(
      await aggregate(
        [reader()],
        [{ $match: { note: 'visible' } }, { $project: { _id: 0, note: 1 } }]
      )
    ).toEqual([{ note: 'visible' }])
  })

  it('denies unauthorized users and does not let a later role override the winner', async () => {
    const denied = { id: 'intruder', custom_data: { role: 'guest' } }
    expect(await aggregate([reader()], [], denied)).toEqual([])
    expect(await service([reader()], denied).countDocuments({})).toBe(0)
    const roles = [reader({ read: false }), reader({ apply_when: {}, fields: {} })]
    expect(await aggregate(roles, [{ $project: { _id: 0, title: 1 } }])).toEqual([
      { title: 'Denied' }
    ])
    expect(await service(roles).countDocuments({})).toBe(1)
    expect(await aggregate([])).toEqual([])
    expect(await service([]).countDocuments({})).toBe(0)
  })

  it('applies document filters and conditional field masks to the original document', async () => {
    await app.mongo.client.db(dbName).collection('records').insertOne({
      owner: 'owner',
      title: 'Limited',
      secret: 'different',
      note: 'second'
    })
    const roles = [
      reader({
        apply_when: {},
        document_filters: { read: { '%%root.owner': '%%user.id' } },
        fields: {
          title: { read: { '%%root.secret': 'hidden' } },
          secret: { read: false },
          note: { read: true }
        },
        additional_fields: { read: false }
      })
    ]
    expect(await aggregate(roles, [{ $project: { _id: 0 } }])).toEqual([
      { title: 'Allowed', note: 'visible' },
      { note: 'second' }
    ])
    expect(await service(roles).countDocuments({ title: 'Allowed' })).toBe(1)
    expect(await service(roles).countDocuments({ owner: 'owner' })).toBe(0)
  })

  it('supports field-only read grants and write grants without exposing additional fields', async () => {
    const roles = [
      reader({ read: undefined, write: undefined, fields: { title: { write: true } } })
    ]
    expect(await aggregate(roles, [{ $project: { _id: 0 } }])).toEqual([
      { title: 'Allowed' }
    ])
    expect(await service(roles).countDocuments({})).toBe(1)
    expect(await service(roles).countDocuments({ note: 'visible' })).toBe(0)
    expect(await service([reader({ read: false, write: true })]).countDocuments({})).toBe(
      1
    )
  })

  it('masks protected fields before caller matching and counting', async () => {
    const roles = [reader({ fields: { note: { read: false } } })]
    expect(await aggregate(roles, [{ $project: { _id: 0, note: 1 } }])).toEqual([{}])
    expect(await service(roles).countDocuments({ note: 'visible' })).toBe(0)
  })

  it('keeps different field permissions for document-dependent winning roles', async () => {
    const roles = [
      reader(),
      reader({
        apply_when: {},
        fields: {
          secret: { read: true },
          note: { read: false }
        }
      })
    ]
    expect(
      await aggregate(roles, [{ $project: { _id: 0, title: 1, secret: 1, note: 1 } }])
    ).toEqual([
      { title: 'Allowed', note: 'visible' },
      { title: 'Denied', secret: 'foreign' }
    ])
    expect(await service(roles).countDocuments({ secret: 'foreign' })).toBe(1)
  })

  it('preserves document-dependent defaults for unspecified fields before caller stages', async () => {
    const roles = [
      reader({
        apply_when: {},
        fields: { title: { read: true }, secret: { read: false } },
        additional_fields: { read: { '%%root.owner': '%%user.id' } }
      })
    ]
    expect(await aggregate(roles, [{ $project: { _id: 0 } }])).toEqual([
      { owner: 'owner', title: 'Allowed', note: 'visible' },
      { title: 'Denied' }
    ])
    expect(await service(roles).countDocuments({ note: 'visible' })).toBe(1)
    expect(await service(roles).countDocuments({ note: 'foreign' })).toBe(0)
    expect(
      await aggregate(roles, [{ $group: { _id: '$owner', total: { $sum: 1 } } }])
    ).toEqual(
      expect.arrayContaining([
        { _id: 'owner', total: 1 },
        { _id: null, total: 1 }
      ])
    )
  })

  it('evaluates nested document paths without traversing arrays', async () => {
    const collection = app.mongo.client.db(dbName).collection('records')
    await collection.updateOne(
      { owner: 'owner' },
      { $set: { scope: { owner: 'owner' } } }
    )
    await collection.updateOne(
      { owner: 'other' },
      { $set: { scope: [{ owner: 'owner' }] } }
    )
    const roles = [reader({ apply_when: { '%%root.scope.owner': '%%user.id' } })]
    expect(await aggregate(roles, [{ $project: { _id: 0, title: 1 } }])).toEqual([
      { title: 'Allowed' }
    ])
    expect(await service(roles).countDocuments({})).toBe(1)
  })

  it.each([
    ['equality', 'owner'],
    ['inequality', { $ne: 'other' }],
    ['membership', { $in: ['owner'] }],
    ['non-membership', { $nin: ['other'] }],
    ['existence', { '%exists': true }]
  ])(
    'supports document %s conditions through the Flowerbase service',
    async (_name, condition) => {
      const roles = [reader({ apply_when: { '%%root.owner': condition } })]
      const expected = _name === 'existence' ? 2 : 1
      expect(await aggregate(roles, [{ $count: 'total' }])).toEqual([{ total: expected }])
      expect(await service(roles).countDocuments({})).toBe(expected)
    }
  )

  it.each(['owner', 'collaborator'])(
    'rejects an account_members upsert by a client %s before database calls',
    async (role) => {
      const roles = ['owner', 'collaborator'].map((name) =>
        reader({
          name,
          apply_when: { '%%user.role': name },
          write: false,
          insert: false
        })
      )
      const nativeFind = jest.spyOn(Collection.prototype, 'findOne')
      const nativeUpdate = jest.spyOn(Collection.prototype, 'updateOne')
      const nativeInsert = jest.spyOn(Collection.prototype, 'insertOne')
      try {
        await expect(
          service(
            roles,
            { id: role, custom_data: { role } },
            'account_members'
          ).updateOne(
            { accountId: 'account', userId: role },
            { $set: { role: 'admin' } },
            { upsert: true }
          )
        ).rejects.toThrow('Update not permitted')
        expect(nativeFind).not.toHaveBeenCalled()
        expect(nativeUpdate).not.toHaveBeenCalled()
        expect(nativeInsert).not.toHaveBeenCalled()
      } finally {
        nativeFind.mockRestore()
        nativeUpdate.mockRestore()
        nativeInsert.mockRestore()
      }
    }
  )

  it('allows an authorized server function to upsert through Flowerbase', async () => {
    const roles = [reader({ fields: {}, write: true, insert: true })]
    const result = await GenerateContext({
      args: [],
      app,
      user,
      rules: config(roles),
      functionsList: {},
      services,
      functionName: 'authorizedUpsert',
      currentFunction: {
        run_as_system: false,
        code: `exports = async function () {
          return context.services.get('mongodb-atlas').db('${dbName}').collection('records')
            .updateOne({ owner: 'owner', title: 'Inserted' },
              { $set: { note: 'server-value' },
                $setOnInsert: { createdAt: new Date('2026-11-16T12:00:00.000Z') } },
              { upsert: true });
        }`
      }
    })
    expect(result).toMatchObject({ upsertedCount: 1 })
    expect(await service(roles).findOne({ title: 'Inserted' })).toMatchObject({
      owner: 'owner',
      note: 'server-value',
      createdAt: new Date('2026-11-16T12:00:00.000Z')
    })
  })

  it('registers a single MongoDB client without automatic encryption', async () => {
    expect(app.mongo.client.options.autoEncryption).toBeUndefined()
    expect(app.mongo).not.toHaveProperty('changestream')
    const stored = await raw.db(dbName).collection('records').findOne({ owner: 'owner' })
    expect(stored!.note).toBe('visible')
  })
})
