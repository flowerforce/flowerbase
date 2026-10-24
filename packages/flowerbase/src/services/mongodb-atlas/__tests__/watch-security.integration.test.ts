import { MongoClient, ObjectId } from 'mongodb'
import MongoDbAtlas from '..'
import { CHANGESTREAM } from '../../../constants'
import { Role } from '../../../utils/roles/interface'
import { Rules } from '../../../features/rules/interface'

const uri = process.env.FLOWERBASE_TEST_MONGO_REPLICA_URI
const integration = uri ? describe : describe.skip

integration('authorized watch on MongoDB replica set', () => {
  let client: MongoClient
  const database = `flowerbase_watch_security_${new ObjectId().toHexString()}`
  const role: Role = {
    name: 'owner',
    apply_when: { '%%root.owner': 'user-1' },
    read: true,
    write: false,
    insert: false,
    delete: false,
    search: true,
    fields: { secret: { read: false, write: false } }
  }
  const operators = (collection = 'documents') =>
    MongoDbAtlas(
      {
        mongo: { client, [CHANGESTREAM]: { client } }
      } as any,
      {
        user: { id: 'user-1' },
        rules: {
          [collection]: {
            database,
            collection,
            filters: [{ name: 'tenant', apply_when: {}, query: { tenant: 'ours' } }],
            roles: [role]
          }
        } as Rules
      }
    )
      .db(database)
      .collection(collection)
  beforeAll(async () => {
    client = await new MongoClient(uri!).connect()
    await client
      .db(database)
      .createCollection('documents', { changeStreamPreAndPostImages: { enabled: true } })
    await client.db(database).createCollection('noPreimages')
  })
  afterAll(async () => {
    await client.db(database).dropDatabase()
    await client.close()
  })

  it('skips other tenants and owners and sanitizes the first authorized event', async () => {
    const stream = operators().watch([], {
      maxAwaitTimeMS: 25,
      collation: { locale: 'en', strength: 1 }
    })
    try {
      await stream.tryNext()
      await client
        .db(database)
        .collection('documents')
        .insertMany([
          { owner: 'user-1', tenant: 'OURS', secret: 'foreign-tenant-secret' },
          { owner: 'other-user', tenant: 'ours', secret: 'foreign-owner-secret' },
          { owner: 'user-1', tenant: 'ours', title: 'visible', secret: 'private' }
        ])
      const event = await stream.next()
      expect(event.fullDocument).toMatchObject({
        owner: 'user-1',
        tenant: 'ours',
        title: 'visible'
      })
      expect(JSON.stringify(event)).not.toContain('secret')
    } finally {
      await stream.close()
    }
  }, 10000)

  it('authorizes deletes against tenant-scoped preimages and redacts those preimages', async () => {
    const native = client.db(database).collection('documents')
    const otherId = new ObjectId(),
      ownId = new ObjectId()
    await native.insertMany([
      { _id: otherId, owner: 'user-1', tenant: 'foreign', secret: 'private' },
      { _id: ownId, owner: 'user-1', tenant: 'ours', secret: 'private' }
    ])
    const stream = operators().watch([{ $match: { operationType: 'delete' } }], {
      maxAwaitTimeMS: 25
    })
    try {
      await stream.tryNext()
      await native.deleteOne({ _id: otherId })
      await native.deleteOne({ _id: ownId })
      const event = await stream.next()
      expect(event.operationType).toBe('delete')
      expect(event.documentKey?._id).toEqual(ownId)
      expect(event.fullDocumentBeforeChange).toEqual({
        _id: ownId,
        owner: 'user-1',
        tenant: 'ours'
      })
    } finally {
      await stream.close()
    }
  }, 10000)

  it('drops deletes when MongoDB cannot provide an authorization preimage', async () => {
    const native = client.db(database).collection('noPreimages')
    const deleted = new ObjectId()
    await native.insertOne({ _id: deleted, owner: 'user-1', tenant: 'ours' })
    const stream = operators('noPreimages').watch([], { maxAwaitTimeMS: 25 })
    try {
      await stream.tryNext()
      await native.deleteOne({ _id: deleted })
      const inserted = await native.insertOne({
        owner: 'user-1',
        tenant: 'ours',
        title: 'next-event'
      })
      const event = await stream.next()
      expect(event.operationType).toBe('insert')
      expect(event.documentKey?._id).toEqual(inserted.insertedId)
    } finally {
      await stream.close()
    }
  }, 10000)
})
