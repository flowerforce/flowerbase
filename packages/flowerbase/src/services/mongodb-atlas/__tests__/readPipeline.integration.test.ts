import { Document, Long, MongoClient, ObjectId } from 'mongodb'
import { Rules } from '../../../features/rules/interface'
import { checkValidation } from '../../../utils/roles/machines'
import { getWinningRoleAsync } from '../../../utils/roles/machines/utils'
import { Role } from '../../../utils/roles/interface'
import { buildAuthorizedReadPipeline } from '../readPipeline'

const uri = process.env.FLOWERBASE_TEST_MONGO_URI
const integration = uri ? describe : describe.skip
const user = { id: 'user-1', custom_data: { role: 'member' } }
const role = (overrides: Partial<Role> = {}): Role => ({
  name: 'reader',
  apply_when: {},
  read: true,
  ...overrides
})

integration('authorized pipelines on MongoDB', () => {
  let client: MongoClient
  const dbName = `flowerbase_read_security_${new ObjectId().toHexString()}`
  const config = (roles: Role[]): Rules =>
    ({
      documents: { database: dbName, collection: 'documents', roles, filters: [] },
      foreign: { database: dbName, collection: 'foreign', roles, filters: [] }
    }) as Rules
  const execute = async (
    roles: Role[],
    pipeline: Document[] = [],
    rules = config(roles)
  ) =>
    client
      .db(dbName)
      .collection('documents')
      .aggregate(
        buildAuthorizedReadPipeline({
          pipeline,
          rules,
          user,
          dbName,
          collName: 'documents'
        }),
        { collation: { locale: 'simple' } }
      )
      .toArray()

  beforeAll(async () => {
    client = await MongoClient.connect(uri!)
  })
  afterAll(async () => {
    await client.db(dbName).dropDatabase()
    await client.close()
  })
  beforeEach(async () => {
    await Promise.all(
      ['documents', 'foreign'].map((name) =>
        client.db(dbName).collection(name).deleteMany({})
      )
    )
  })

  it('removes unauthorized documents and protected fields before projection, grouping and facets', async () => {
    await client
      .db(dbName)
      .collection('documents')
      .insertMany([
        { ownerId: 'user-1', title: 'Allowed', secret: 'own-secret' },
        { ownerId: 'other-user', title: 'Denied', secret: 'foreign-secret' }
      ])
    const roles = [
      role({
        apply_when: { '%%root.ownerId': '%%user.id' },
        fields: { secret: { read: false } }
      })
    ]
    const result = await execute(roles, [
      {
        $facet: {
          projected: [{ $project: { _id: 0, title: 1, stolen: '$secret' } }],
          grouped: [{ $group: { _id: '$secret', total: { $sum: 1 } } }]
        }
      }
    ])
    expect(result).toEqual([
      { projected: [{ title: 'Allowed' }], grouped: [{ _id: null, total: 1 }] }
    ])
  })

  it('retains the first matching role when a later role would grant access', async () => {
    await client
      .db(dbName)
      .collection('documents')
      .insertMany([{ ownerId: 'user-1' }, { ownerId: 'other-user' }])
    const result = await execute(
      [role({ apply_when: { '%%root.ownerId': 'user-1' }, read: false }), role()],
      [{ $project: { _id: 0, ownerId: 1 } }]
    )
    expect(result).toEqual([{ ownerId: 'other-user' }])
  })

  it('applies document_filters and conditional field/additional_fields permissions', async () => {
    await client
      .db(dbName)
      .collection('documents')
      .insertMany([
        { ownerId: 'user-1', reveal: 'yes', secret: 'visible', extra: 1 },
        { ownerId: 'user-1', reveal: 'no', secret: 'hidden', extra: 2 },
        { ownerId: 'other-user', reveal: 'yes', secret: 'foreign', extra: 3 }
      ])
    const roles = [
      role({
        document_filters: { read: { '%%root.ownerId': '%%user.id' } },
        fields: { secret: { read: { '%%root.reveal': 'yes' } } },
        additional_fields: { read: false }
      })
    ]
    const result = await execute(roles, [{ $project: { _id: 0 } }])
    expect(result).toEqual([{ secret: 'visible' }, {}])
  })

  it.each([
    ['scalar equality', 'member'],
    ['scalar-array equality', { $eq: ['member'] }],
    ['inequality has no scalar-array membership', { $ne: 'member' }],
    ['array inequality uses reference semantics', { $ne: ['member'] }],
    ['in with null and scalar candidates', { $in: ['member', null] }],
    ['nin with nested candidates', { $nin: [['member'], null] }],
    ['exists true', true],
    ['exists false', false],
    ['explicit exists', { '%exists': true }],
    ['numeric equality', 1],
    ['ObjectId equality', 'AbCdEf0123456789aBcDeF01'],
    ['empty membership', []]
  ])('matches the runtime semantics for %s', async (_name, condition) => {
    await client
      .db(dbName)
      .collection('documents')
      .insertMany([
        {},
        { value: null },
        { value: '' },
        { value: ' \t\u00a0\ufeff' },
        { value: '\u0085' },
        { value: false },
        { value: true },
        { value: 0 },
        { value: 1 },
        { value: Long.fromNumber(1) },
        { value: Long.fromString('9007199254740993') },
        { value: 'member' },
        { value: ['member'] },
        { value: [['member']] },
        { value: [] },
        { value: {} },
        { value: { key: 'member' } },
        { value: new ObjectId('abcdef0123456789abcdef01') },
        { value: 'ABCDEF0123456789ABCDEF01' }
      ])
    const roles = [role({ apply_when: { '%%root.value': condition } })]
    const documents = await client.db(dbName).collection('documents').find().toArray()
    const expected = []
    for (const document of documents) {
      const selected = await getWinningRoleAsync(document, user, roles)
      if (selected) {
        const checked = await checkValidation(
          selected,
          { type: 'read', roles, cursor: document, expansions: {} },
          user
        )
        if (checked.status) expected.push(checked.document)
      }
    }
    expect(await execute(roles)).toEqual(expected)
  })

  it('evaluates user-only role predicates with custom_data role normalization', async () => {
    await client.db(dbName).collection('documents').insertOne({ ownerId: 'user-1' })
    const result = await execute([
      role({
        apply_when: {
          $and: [
            { '%%user.role': { $in: ['member', 'admin'] } },
            { '%%root.ownerId': '%%user.id' }
          ]
        }
      })
    ])
    expect(result).toHaveLength(1)
  })

  it('guards lookup, simple unionWith and lookup projections before derived leaks', async () => {
    await client
      .db(dbName)
      .collection('documents')
      .insertOne({ ownerId: 'user-1', join: 'group' })
    await client
      .db(dbName)
      .collection('foreign')
      .insertMany([
        { ownerId: 'user-1', join: 'group', title: 'Allowed', secret: 'hidden' },
        {
          ownerId: 'other-user',
          join: 'group',
          title: 'Denied',
          secret: 'foreign-hidden'
        }
      ])
    const roles = [
      role({
        apply_when: { '%%root.ownerId': 'user-1' },
        fields: { secret: { read: false } }
      })
    ]
    const result = await execute(roles, [
      {
        $lookup: {
          from: 'foreign',
          localField: 'join',
          foreignField: 'join',
          as: 'joined',
          pipeline: [{ $project: { _id: 0, title: 1, stolen: '$secret' } }]
        }
      },
      { $unionWith: 'foreign' },
      { $project: { _id: 0, joined: 1, title: 1, stolen: '$secret' } }
    ])
    expect(result).toEqual([{ joined: [{ title: 'Allowed' }] }, { title: 'Allowed' }])
  })

  it('does not join using a foreign field hidden by its read rules', async () => {
    await client.db(dbName).collection('documents').insertOne({ foreignKey: 'private' })
    await client
      .db(dbName)
      .collection('foreign')
      .insertOne({ secret: 'private', title: 'Foreign' })
    const roles = [role({ fields: { secret: { read: false } } })]
    const result = await execute(roles, [
      {
        $lookup: {
          from: 'foreign',
          localField: 'foreignKey',
          foreignField: 'secret',
          as: 'joined'
        }
      }
    ])
    expect(result[0].joined).toEqual([])
  })

  it('preserves native concise lookup joins for scalar, null, missing and array keys', async () => {
    const values = [
      {},
      { join: null },
      { join: [] },
      { join: 'a' },
      { join: ['a', 'b'] },
      { join: [['a']] }
    ]
    await client
      .db(dbName)
      .collection('documents')
      .insertMany(values.map((value, label) => ({ ...value, label })))
    await client
      .db(dbName)
      .collection('foreign')
      .insertMany(values.map((value, label) => ({ ...value, label })))
    const pipeline = [
      {
        $lookup: {
          from: 'foreign',
          localField: 'join',
          foreignField: 'join',
          as: 'joined'
        }
      },
      { $project: { _id: 0, label: 1, joined: '$joined.label' } }
    ]
    const native = await client
      .db(dbName)
      .collection('documents')
      .aggregate(pipeline)
      .toArray()
    expect(await execute([role()], pipeline)).toEqual(native)
  })
})
