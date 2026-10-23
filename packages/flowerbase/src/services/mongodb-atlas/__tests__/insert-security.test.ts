import MongoDbAtlas from '..'
import { Role } from '../../../utils/roles/interface'
import { Rules } from '../../../features/rules/interface'

const fixture = (insert: Role['insert']) => {
  const collection = {
    collectionName: 'memberships',
    insertOne: jest.fn().mockResolvedValue({ insertedId: 'new-id' }),
    insertMany: jest.fn().mockResolvedValue({ insertedIds: { 0: 'new-id' } })
  }
  const app = {
    mongo: { client: { db: jest.fn().mockReturnValue({ collection: () => collection }) } }
  }
  const role: Role = {
    name: 'member',
    apply_when: {},
    insert,
    delete: false,
    search: true,
    read: true,
    write: undefined,
    fields: { userId: { write: true }, admin: { write: true } },
    additional_fields: { write: true }
  }
  const operators = MongoDbAtlas(app as any, {
    user: { id: 'user-1' },
    rules: {
      memberships: {
        database: 'db',
        collection: 'memberships',
        filters: [],
        roles: [role]
      }
    } as Rules
  })
    .db('db')
    .collection('memberships')
  return { operators, collection }
}

describe('explicit insert permissions', () => {
  it.each(['insertOne', 'insertMany'] as const)(
    '%s cannot use field write permission to bypass insert:false',
    async (method) => {
      const { operators, collection } = fixture(false)
      const document = { userId: 'user-1', admin: true }
      const operation =
        method === 'insertOne'
          ? operators.insertOne(document)
          : operators.insertMany([document])
      await expect(operation).rejects.toThrow('Insert not permitted')
      expect(collection[method]).not.toHaveBeenCalled()
    }
  )
  it('evaluates conditional insert permission independently from writable fields', async () => {
    const { operators, collection } = fixture({ '%%user.role': 'admin' })
    await expect(operators.insertOne({ userId: 'user-1' })).rejects.toThrow(
      'Insert not permitted'
    )
    expect(collection.insertOne).not.toHaveBeenCalled()
  })
  it('still permits explicitly authorized inserts with field write permissions', async () => {
    const { operators, collection } = fixture(true)
    const document = { userId: 'user-1', admin: false }
    await expect(operators.insertMany([document])).resolves.toEqual({
      insertedIds: ['new-id']
    })
    expect(collection.insertMany).toHaveBeenCalledWith([document], undefined)
  })
})
