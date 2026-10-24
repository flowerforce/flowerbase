import { Document, MongoClient, ObjectId } from 'mongodb'
import {
  createAuthorizedFindCursor,
  projectReadableDocument
} from '../authorizedFindCursor'
import { checkValidation } from '../../../utils/roles/machines'
import { getWinningRoleAsync } from '../../../utils/roles/machines/utils'
import { Role } from '../../../utils/roles/interface'

const uri = process.env.FLOWERBASE_TEST_MONGO_URI
const integration = uri ? describe : describe.skip
integration('authorized find cursors on MongoDB', () => {
  let client: MongoClient
  const dbName = `flowerbase_cursor_security_${new ObjectId().toHexString()}`
  const roles: Role[] = [
    {
      name: 'owner',
      apply_when: { '%%root.owner': 'user-1' },
      read: true,
      fields: { secret: { read: false } }
    }
  ]
  const validateDocument = async (document: Document) => {
    const role = await getWinningRoleAsync(document, { id: 'user-1' }, roles)
    if (!role) return undefined
    const result = await checkValidation(
      role,
      { type: 'read', roles, cursor: document, expansions: {} },
      { id: 'user-1' }
    )
    return result.status ? result.document : undefined
  }
  const cursor = (projection?: Document) =>
    createAuthorizedFindCursor({
      cursor: client
        .db(dbName)
        .collection('docs')
        .find({}, { sort: { rank: 1 }, batchSize: 1 }),
      validateDocument,
      scopeQuery: (query) => ({ $and: [{ tenant: 'mine' }, query] }),
      projection
    })
  beforeAll(async () => {
    client = await MongoClient.connect(uri!)
  })
  afterAll(async () => {
    await client.db(dbName).dropDatabase()
    await client.close()
  })
  beforeEach(async () => {
    const collection = client.db(dbName).collection('docs')
    await collection.deleteMany({})
    await collection.insertMany([
      {
        rank: 1,
        tenant: 'mine',
        owner: 'other-user',
        title: 'Denied',
        secret: 'foreign-secret'
      },
      { rank: 2, tenant: 'mine', owner: 'user-1', title: 'Allowed', secret: 'own-secret' }
    ])
  })

  it.each(['next', 'tryNext'] as const)(
    '%s filters server batches and returns only readable fields',
    async (method) => {
      const guarded = cursor({ _id: 0, title: 1 })
      try {
        expect(await guarded[method]()).toEqual({ title: 'Allowed' })
        expect(await guarded[method]()).toBeNull()
      } finally {
        await guarded.close()
      }
    }
  )

  it('protects native cloning, mapping, streaming and forEach consumption', async () => {
    const guarded = cursor({ _id: 0, title: 1 })
    const mapped = guarded.map((doc) => ({ title: doc.title, leaked: doc.secret }))
    try {
      expect(await mapped.clone().toArray()).toEqual([
        { title: 'Allowed', leaked: undefined }
      ])
      const streamed = []
      for await (const document of mapped.stream()) streamed.push(document)
      expect(streamed).toEqual([{ title: 'Allowed', leaked: undefined }])
      const callback = jest.fn()
      await cursor({ _id: 0, title: 1 }).forEach(callback)
      expect(callback).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledWith({ title: 'Allowed' })
    } finally {
      await guarded.close()
    }
  })

  it('reapplies scope when native filter is replaced', async () => {
    await client
      .db(dbName)
      .collection('docs')
      .insertOne({ tenant: 'other', owner: 'user-1', title: 'Wrong tenant' })
    expect(
      await cursor({ _id: 0, title: 1 }).filter({ tenant: 'other' }).toArray()
    ).toEqual([])
  })

  it('keeps authorization inputs when project is changed on a clone', async () => {
    const guarded = cursor()
    try {
      expect(await guarded.clone().project({ _id: 0, title: 1 }).toArray()).toEqual([
        { title: 'Allowed' }
      ])
    } finally {
      await guarded.close()
    }
  })

  it.each([
    { _id: 0, 'array.visible': 1 },
    { _id: 0, 'array.visible': 0 },
    { _id: 0, 'array.visible.deeper': 1 },
    { _id: 0, 'object.visible': 1 },
    { _id: 1 },
    { _id: 0 },
    { array: 1 },
    { array: 0 }
  ])('matches native boolean projection %j', async (projection) => {
    const document = {
      _id: new ObjectId(),
      object: { visible: 1, hidden: 2 },
      array: [1, 'x', null, { visible: 1, hidden: 2 }, [{ visible: 3, hidden: 4 }]]
    }
    await client
      .db(dbName)
      .collection('projections')
      .replaceOne({ _id: document._id }, document, { upsert: true })
    const native = await client
      .db(dbName)
      .collection('projections')
      .findOne({ _id: document._id }, { projection })
    expect(projectReadableDocument(document, projection)).toEqual(native)
  })
})
