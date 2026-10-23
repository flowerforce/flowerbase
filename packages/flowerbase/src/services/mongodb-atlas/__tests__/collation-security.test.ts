import { Collection, MongoClient, ObjectId } from 'mongodb'
import MongoDbAtlas from '..'
import type { Role, Rules } from '../../../features/rules/interface'

const methods = ['updateOne', 'findOneAndUpdate', 'updateMany', 'deleteOne', 'deleteMany'] as const
type Method = typeof methods[number]
type Operators = ReturnType<ReturnType<ReturnType<typeof MongoDbAtlas>['db']>['collection']>
const looseCollation = { locale: 'en', strength: 1 }
const simpleCollation = { locale: 'simple' }
const member: Role = { name: 'member', apply_when: {}, search: true, read: true, write: true, insert: true, delete: true }

const write = (operators: Operators, method: Method, query: Record<string, unknown>, options?: Record<string, unknown>) =>
  method === 'deleteOne' || method === 'deleteMany'
    ? operators[method](query, options)
    : operators[method](query, { $set: { label: 'changed' } }, options)

describe('write collation authorization', () => {
  it.each(methods)('%s keeps user authorization comparisons binary and preserves other options', async (method) => {
    const previous = { _id: 'own', label: 'before' }
    const collection = {
      collectionName: 'documents',
      findOne: jest.fn().mockResolvedValue(previous),
      find: jest.fn().mockReturnValue({ toArray: jest.fn().mockResolvedValue([previous]) }),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      findOneAndUpdate: jest.fn().mockResolvedValue(previous),
      updateMany: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteMany: jest.fn().mockResolvedValue({ acknowledged: true })
    }
    const app = { mongo: { client: { db: () => ({ collection: () => collection }) } } }
    const rules = { documents: { database: 'db', collection: 'documents', filters: [], roles: [member] } } as Rules
    const operators = MongoDbAtlas(app as any, { rules, user: { id: 'user' } }).db('db').collection('documents')
    const options = { collation: looseCollation, comment: 'write-security' }
    await write(operators, method, {}, options)
    const calls = collection[method].mock.calls
    expect(calls[0][calls[0].length - 1]).toEqual({ collation: simpleCollation, comment: 'write-security' })
    const selection = method === 'updateMany' || method === 'deleteMany' ? collection.find : collection.findOne
    expect(selection.mock.calls[0][1]).toEqual({ collation: simpleCollation, comment: 'write-security' })
    expect(options.collation).toEqual(looseCollation)
  })

  it.each(methods)('%s preserves native collation in system mode', async (method) => {
    const native = jest.fn().mockResolvedValue({ acknowledged: true })
    const collection = { collectionName: 'documents', [method]: native }
    const app = { mongo: { client: { db: () => ({ collection: () => collection }) } } }
    const operators = MongoDbAtlas(app as any, { run_as_system: true }).db('db').collection('documents')
    const options = { collation: looseCollation }
    await write(operators, method, {}, options)
    const calls = native.mock.calls
    expect(calls[0][calls[0].length - 1]).toEqual(options)
  })
})

const uri = process.env.FLOWERBASE_TEST_MONGO_URI
const integration = uri ? describe : describe.skip
type TestDocument = { _id: string; tenant: string; label: string; owner?: string }

integration('write collation isolation on MongoDB', () => {
  let client: MongoClient
  let collection: Collection<TestDocument>
  const dbName = `flowerbase_collation_security_${new ObjectId().toHexString()}`
  const rules = (filters = true): Rules => ({
    documents: {
      database: dbName,
      collection: 'documents',
      filters: filters ? [{ name: 'tenant', apply_when: {}, query: { tenant: '%%user.custom_data.tenant' } }] : [],
      roles: [member]
    }
  } as Rules)
  const operators = (config = rules(), system = false) => MongoDbAtlas(
    { mongo: { client } } as any,
    { rules: config, user: { id: 'user', custom_data: { tenant: 'TenantA' } }, run_as_system: system }
  ).db(dbName).collection('documents')

  beforeAll(async () => { client = await MongoClient.connect(uri!) })
  afterAll(async () => { await client.db(dbName).dropDatabase(); await client.close() })

  describe.each(['explicit option', 'collection default'] as const)('%s', (source) => {
    beforeEach(async () => {
      await client.db(dbName).dropDatabase()
      collection = await client.db(dbName).createCollection<TestDocument>('documents',
        source === 'collection default' ? { collation: looseCollation } : {})
      await collection.insertMany([
        { _id: 'own', tenant: 'TenantA', label: 'before' },
        { _id: 'victim', tenant: 'tenanta', label: 'before' }
      ])
    })

    it.each(methods)('%s cannot change another tenant by changing string equality', async (method) => {
      const options = source === 'explicit option' ? { collation: looseCollation } : undefined
      if (method === 'deleteMany') {
        if (source === 'explicit option') {
          await collection.deleteMany({})
          await collection.insertMany([
            { _id: 'row', tenant: 'TenantA', label: 'before' },
            { _id: 'ROW', tenant: 'tenanta', label: 'before' }
          ])
        }
        const result = await operators().deleteMany({}, options)
        expect(result.deletedCount).toBe(1)
        expect(await collection.find({}, { collation: simpleCollation }).toArray()).toEqual([
          { _id: source === 'explicit option' ? 'ROW' : 'victim', tenant: 'tenanta', label: 'before' }
        ])
      } else if (method === 'updateMany') {
        const result = await operators().updateMany({}, { $set: { label: 'changed' } }, options)
        expect(result.modifiedCount).toBe(1)
        expect(await collection.findOne({ _id: 'victim' }, { collation: simpleCollation })).toMatchObject({ label: 'before' })
      } else if (method === 'deleteOne') {
        const result = await operators().deleteOne({ _id: 'victim' } as Record<string, unknown>, options)
        expect(result.deletedCount).toBe(0)
        expect(await collection.countDocuments()).toBe(2)
      } else {
        await expect(write(operators(), method, { _id: 'victim' }, options)).rejects.toThrow('Update not permitted')
        expect(await collection.findOne({ _id: 'victim' }, { collation: simpleCollation })).toMatchObject({ label: 'before' })
      }
    })
  })

  it('keeps exact string ID pins when document roles are the only access boundary', async () => {
    await client.db(dbName).dropDatabase()
    collection = await client.db(dbName).createCollection<TestDocument>('documents')
    await collection.insertMany([
      { _id: 'row', tenant: 'TenantA', owner: 'user', label: 'before' },
      { _id: 'ROW', tenant: 'tenanta', owner: 'other-user', label: 'before' }
    ])
    const config = rules(false)
    config.documents.roles = [{ ...member, apply_when: { '%%root.owner': '%%user.id' } }]
    expect((await operators(config).deleteMany({ label: 'before' }, { collation: looseCollation })).deletedCount).toBe(1)
    expect(await collection.find({}).toArray()).toEqual([
      { _id: 'ROW', tenant: 'tenanta', owner: 'other-user', label: 'before' }
    ])
  })
})
