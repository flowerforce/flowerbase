import { Document, FindCursor, ObjectId } from 'mongodb'
import {
  createAuthorizedFindCursor,
  projectReadableDocument
} from '../authorizedFindCursor'
import { checkValidation } from '../../../utils/roles/machines'
import { getWinningRoleAsync } from '../../../utils/roles/machines/utils'
import { Role } from '../../../utils/roles/interface'

const records = [
  { _id: new ObjectId(), owner: 'other-user', title: 'Denied', secret: 'foreign-secret' },
  { _id: new ObjectId(), owner: 'user-1', title: 'Allowed', secret: 'own-secret' }
]
const roles: Role[] = [
  {
    name: 'owner',
    apply_when: { '%%root.owner': 'user-1' },
    read: true,
    fields: { secret: { read: false } }
  }
]

const validateDocument = async (document: Document) => {
  const user = { id: 'user-1' }
  const role = await getWinningRoleAsync(document, user, roles)
  if (!role) return undefined
  const result = await checkValidation(
    role,
    { type: 'read', roles, cursor: document, expansions: {} },
    user
  )
  return result.status ? result.document : undefined
}

const nativeCursor = (documents = records): Record<string, any> => {
  let index = 0
  const cursor = {
    next: jest.fn(async () => documents[index++] ?? null),
    tryNext: jest.fn(async () => documents[index++] ?? null),
    close: jest.fn(async () => undefined),
    clone: jest.fn(() => nativeCursor(documents)),
    rewind: jest.fn(() => {
      index = 0
    }),
    filter: jest.fn(),
    sort: jest.fn(),
    project: jest.fn(),
    toArray: jest.fn(async () => documents),
    closed: false,
    killed: false
  }
  return cursor
}
const fixture = (documents = records, projection?: Document) => {
  const raw = nativeCursor(documents)
  const scopeQuery = jest.fn((query) => ({ $and: [{ tenant: 'mine' }, query] }))
  const cursor = createAuthorizedFindCursor({
    cursor: raw as unknown as FindCursor,
    validateDocument,
    scopeQuery,
    projection
  })
  return { cursor, raw, scopeQuery }
}

describe('authorized find cursor', () => {
  it.each(['next', 'tryNext'] as const)(
    '%s skips unauthorized documents and redacts protected fields',
    async (method) => {
      const { cursor, raw } = fixture()
      expect(await cursor[method]()).toEqual({
        _id: records[1]._id,
        owner: 'user-1',
        title: 'Allowed'
      })
      expect(await cursor[method]()).toBeNull()
      expect(raw.toArray).not.toHaveBeenCalled()
    }
  )

  it('toArray validates every document instead of using native toArray', async () => {
    const { cursor, raw } = fixture()
    expect(await cursor.toArray()).toEqual([
      { _id: records[1]._id, owner: 'user-1', title: 'Allowed' }
    ])
    expect(raw.toArray).not.toHaveBeenCalled()
    expect(raw.close).toHaveBeenCalled()
  })

  it('hasNext preloads an authorized document without consuming it twice', async () => {
    const { cursor, raw } = fixture()
    expect(await cursor.hasNext()).toBe(true)
    expect(await cursor.hasNext()).toBe(true)
    expect(raw.next).toHaveBeenCalledTimes(2)
    expect((await cursor.next())?.title).toBe('Allowed')
    expect(await cursor.hasNext()).toBe(false)
  })

  it('hasNext cannot disclose the presence of only unauthorized documents', async () => {
    const { cursor } = fixture([records[0]])
    expect(await cursor.hasNext()).toBe(false)
  })

  it('async iteration and forEach receive only authorized data', async () => {
    const iterated = []
    for await (const document of fixture().cursor) iterated.push(document.title)
    expect(iterated).toEqual(['Allowed'])
    const callback = jest.fn()
    await fixture().cursor.forEach(callback)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).not.toHaveProperty('secret')
  })

  it('stream transforms operate on sanitized documents', async () => {
    const transform = jest.fn((document) => ({
      title: document.title,
      secret: document.secret
    }))
    const documents = []
    for await (const document of fixture().cursor.stream({ transform }))
      documents.push(document)
    expect(documents).toEqual([{ title: 'Allowed', secret: undefined }])
    expect(transform).toHaveBeenCalledTimes(1)
  })

  it('map, clone and count retain authorization and cannot expose raw documents', async () => {
    const { cursor } = fixture()
    const transform = jest.fn((document) => ({
      title: document.title,
      secret: document.secret
    }))
    const mapped = cursor.map(transform)
    expect(await mapped.clone().toArray()).toEqual([
      { title: 'Allowed', secret: undefined }
    ])
    expect(await mapped.count()).toBe(1)
    expect(await mapped.next()).toEqual({ title: 'Allowed', secret: undefined })
    expect(transform).toHaveBeenCalledTimes(3)
  })

  it('rewind repeats authorization and clears a preloaded document', async () => {
    const { cursor } = fixture()
    await cursor.hasNext()
    cursor.rewind()
    expect(await cursor.toArray()).toHaveLength(1)
  })

  it('validates the complete original document before applying caller projections', async () => {
    const { cursor, raw } = fixture(records, { _id: 0, title: 1 })
    expect(await cursor.toArray()).toEqual([{ title: 'Allowed' }])
    expect(raw.project).not.toHaveBeenCalled()
  })

  it('project can narrow a cursor after creation without changing its authorization inputs', async () => {
    const { cursor, raw } = fixture()
    expect(await cursor.project({ _id: 0, title: 1 }).toArray()).toEqual([
      { title: 'Allowed' }
    ])
    expect(raw.project).not.toHaveBeenCalled()
  })

  it('reapplies the collection scope when filter changes', () => {
    const { cursor, raw, scopeQuery } = fixture()
    expect(cursor.filter({ tenant: 'other' }).sort({ title: 1 })).toBe(cursor)
    expect(scopeQuery).toHaveBeenCalledWith({ tenant: 'other' })
    expect(raw.filter).toHaveBeenCalledWith({
      $and: [{ tenant: 'mine' }, { tenant: 'other' }]
    })
  })

  it('retains rules projections when project and clone are used', async () => {
    const raw = nativeCursor()
    const cursor = createAuthorizedFindCursor({
      cursor: raw as unknown as FindCursor,
      validateDocument,
      scopeQuery: (query) => query,
      scopeProjection: (projection) => ({ ...projection, owner: 0 })
    })
    expect(await cursor.project({ secret: 0 }).clone().toArray()).toEqual([
      { _id: records[1]._id, title: 'Allowed' }
    ])
  })

  it('rejects collation changes that could alter collection filters', () => {
    const { cursor } = fixture()
    expect(() => cursor.collation({ locale: 'en', strength: 1 })).toThrow(
      'Non-simple collation'
    )
  })

  it.each([
    'client',
    'session',
    'findOptions',
    'getMore',
    'readBufferedDocuments',
    'explain',
    'documents'
  ])('does not expose native %s', (member) => {
    const { cursor } = fixture()
    expect(() => (cursor as any)[member]).toThrow('not available for authorized reads')
  })

  it('does not expose native state through own property descriptors', () => {
    const { cursor } = fixture()
    expect(Object.getOwnPropertyNames(cursor)).toEqual([])
    expect(Object.getPrototypeOf(cursor)).toBeNull()
    expect(() => {
      ;(cursor as any).client = {}
    }).toThrow('cannot be modified')
  })

  it('serializes concurrent next calls without duplicating or bypassing validation', async () => {
    const { cursor } = fixture()
    const result = await Promise.all([cursor.next(), cursor.next(), cursor.next()])
    expect(result.map((entry) => entry?.title ?? null)).toEqual(['Allowed', null, null])
  })
})

describe('read projections after authorization', () => {
  const document = {
    _id: 1,
    owner: 'user-1',
    object: { visible: 1, hidden: 2 },
    values: [1, 'x', null, { visible: 1, hidden: 2 }, [{ visible: 3, hidden: 4 }]]
  }
  it.each([
    [{ _id: 0, 'object.visible': 1 }, { object: { visible: 1 } }],
    [{ _id: 0, 'values.visible': 1 }, { values: [{ visible: 1 }, [{ visible: 3 }]] }],
    [{ _id: 0, 'values.visible.deeper': 1 }, { values: [{}, [{}]] }],
    [{ _id: true }, { _id: 1 }],
    [{ owner: false }, { _id: 1, object: document.object, values: document.values }],
    [{ _id: 0, missing: 1 }, {}]
  ] as const)('applies %j', (projection, expected) => {
    expect(projectReadableDocument(document, projection)).toEqual(expected)
  })

  it('excludes dotted array/object fields while preserving scalar array entries', () => {
    expect(
      projectReadableDocument(document, {
        _id: 0,
        'values.hidden': 0,
        'object.hidden': 0
      })
    ).toEqual({
      owner: 'user-1',
      object: { visible: 1 },
      values: [1, 'x', null, { visible: 1 }, [{ visible: 3 }]]
    })
  })

  it.each([
    { title: '$secret' },
    { owner: { $literal: 'user-1' } },
    { owner: 1, title: 0 },
    { values: 1, 'values.visible': 1 },
    { 'values.0': 1 },
    { 'values.$': 1 }
  ])('rejects an unsupported or ambiguous projection %j', (projection) => {
    expect(() => projectReadableDocument(document, projection)).toThrow()
  })
})
