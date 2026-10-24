import { EventEmitter } from 'node:events'
import { Document } from 'mongodb'
import MongoDbAtlas from '..'
import { CHANGESTREAM } from '../../../constants'
import { Rules } from '../../../features/rules/interface'
import { Role } from '../../../utils/roles/interface'

const role = (extra: Partial<Role> = {}): Role => ({
  name: 'owner',
  apply_when: { '%%root.owner': 'user-1' },
  read: true,
  write: false,
  fields: { secret: { read: false, write: false } },
  ...extra
})
const fixture = (roles = [role()], filters: any[] = []) => {
  const stream = Object.assign(new EventEmitter(), {
    closed: false,
    close: jest.fn().mockResolvedValue(undefined),
    next: jest.fn(),
    tryNext: jest.fn()
  })
  const cursor: any = {
    toArray: jest.fn().mockResolvedValue([{ count: 2 }]),
    addStage: jest.fn().mockReturnThis(),
    clone: jest.fn(() => ({ ...cursor }))
  }
  const collection = {
    collectionName: 'documents',
    watch: jest.fn().mockReturnValue(stream),
    aggregate: jest.fn().mockReturnValue(cursor),
    countDocuments: jest.fn().mockResolvedValue(999)
  }
  const db = jest
    .fn()
    .mockReturnValue({ collection: jest.fn().mockReturnValue(collection) })
  const app = { mongo: { client: { db }, [CHANGESTREAM]: { client: { db } } } }
  const rules = {
    documents: { database: 'db', collection: 'documents', roles, filters }
  } as Rules
  const service = MongoDbAtlas(app as any, { rules, user: { id: 'user-1' } })
  return {
    app,
    rules,
    collection,
    cursor,
    stream,
    db,
    service,
    operators: service.db('db').collection('documents')
  }
}
const change = (owner = 'user-1'): Document => ({
  _id: 'resume',
  operationType: 'update',
  documentKey: { _id: 1, secretShardKey: 'private' },
  fullDocument: { _id: 1, owner, title: 'public', secret: 'private' },
  fullDocumentBeforeChange: { _id: 1, owner, secret: 'old-private' },
  stolen: 'private',
  updateDescription: {
    updatedFields: { title: 'public', secret: 'private' },
    removedFields: ['secret.hidden'],
    truncatedArrays: [{ field: 'secret', newSize: 0 }]
  }
})
const flush = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('read authorization boundaries', () => {
  it('does not expose privileged MongoDB clients through a user-mode session', () => {
    const { service, app } = fixture()
    const startSession = jest.fn().mockReturnValue({ client: 'privileged-client' })
    Object.assign(app.mongo.client, { startSession })
    expect(() => service.startSession()).toThrow('startSession requires run_as_system')
    expect(startSession).not.toHaveBeenCalled()
    expect(MongoDbAtlas(app as any, { run_as_system: true }).startSession()).toEqual({
      client: 'privileged-client'
    })
  })
  it('rejects another database before contacting MongoDB, including same collection name', () => {
    const { service, db } = fixture()
    db.mockClear()
    expect(() => service.db('other-db').collection('documents')).toThrow(
      'Collection access not permitted'
    )
    expect(db).not.toHaveBeenCalled()
  })
  it('rejects inherited rule map properties', () => {
    const { app, rules } = fixture()
    const inherited = Object.create(rules)
    expect(() =>
      MongoDbAtlas(app as any, { rules: inherited })
        .db('db')
        .collection('documents')
    ).toThrow('Collection access not permitted')
  })
  it.each([undefined, false, true])(
    'guards aggregate with isClient=%s',
    async (isClient) => {
      const { operators, collection } = fixture()
      const result = operators.aggregate(
        [{ $project: { stolen: '$secret' } }],
        { collation: { locale: 'en', strength: 1 } },
        isClient as any
      )
      await result.toArray()
      const [pipeline, options] = collection.aggregate.mock.calls[0] as any
      expect(pipeline[0]).toHaveProperty('$match.$expr')
      expect(pipeline[1]).toHaveProperty('$replaceRoot')
      expect(pipeline[2]).toEqual({ $project: { stolen: '$secret' } })
      expect(options.collation).toEqual({ locale: 'simple' })
    }
  )
  it('guards fluent aggregate lookup, union and clones and rejects writes', () => {
    const { operators, cursor } = fixture()
    const aggregate = operators.aggregate([], {}, false)
    ;(aggregate as any).lookup({ from: 'documents', as: 'joined', pipeline: [] })
    expect(cursor.addStage.mock.calls[0][0].$lookup.pipeline[0]).toHaveProperty(
      '$match.$expr'
    )
    expect(() => (aggregate as any).out('stolen')).toThrow('cannot compile stage $out')
    expect(() => aggregate.pipeline).toThrow('not supported')
    expect(() => (aggregate.clone() as any).addStage({ $merge: 'stolen' })).toThrow(
      'cannot compile stage $merge'
    )
  })
  it.each(['count', 'countDocuments'] as const)(
    '%s uses the role and field guard before matching and counting',
    async (method) => {
      const { operators, collection } = fixture()
      expect(await operators[method]({ secret: 'private' }, { skip: 1, limit: 5 })).toBe(
        2
      )
      expect(collection.countDocuments).not.toHaveBeenCalled()
      const [pipeline] = collection.aggregate.mock.calls[0] as any
      expect(pipeline[0]).toHaveProperty('$match.$expr')
      expect(pipeline[1]).toHaveProperty('$replaceRoot')
      expect(pipeline.slice(-4)).toEqual([
        { $match: { secret: 'private' } },
        { $skip: 1 },
        { $limit: 5 },
        { $count: 'count' }
      ])
    }
  )
})

describe('authorized change stream', () => {
  it('drops unauthorized documents and missing roles instead of emitting filtered failures', async () => {
    const { operators, stream } = fixture()
    const listener = jest.fn()
    operators.watch().on('change', listener)
    stream.emit('change', change('other-user'))
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })
  it('honors document_filters read denials', async () => {
    const { operators, stream } = fixture([
      role({ document_filters: { read: false, write: false } })
    ])
    const listener = jest.fn()
    operators.watch().on('change', listener)
    stream.emit('change', change())
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })
  it('removes secrets from full document, update metadata, shard keys and arbitrary aliases', async () => {
    const { operators, stream } = fixture()
    const listener = jest.fn()
    operators.watch().on('change', listener)
    stream.emit('change', change())
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    const event = listener.mock.calls[0][0]
    expect(event.fullDocument).toEqual({ _id: 1, owner: 'user-1', title: 'public' })
    expect(event.documentKey).toEqual({ _id: 1 })
    expect(event.updateDescription).toEqual({
      updatedFields: { title: 'public' },
      removedFields: [],
      truncatedArrays: []
    })
    expect(JSON.stringify(event)).not.toContain('private')
    expect(event).not.toHaveProperty('fullDocumentBeforeChange')
    expect(event).not.toHaveProperty('stolen')
  })
  it('drops deletes without preimages or for another owner, and permits authorized preimages', async () => {
    const { operators, stream, collection } = fixture()
    const listener = jest.fn()
    operators.watch([{ $match: { operationType: 'delete' } }]).on('change', listener)
    stream.emit('change', { operationType: 'delete', documentKey: { _id: 1 } })
    stream.emit('change', {
      operationType: 'delete',
      fullDocumentBeforeChange: { _id: 2, owner: 'other-user' }
    })
    stream.emit('change', {
      operationType: 'delete',
      fullDocumentBeforeChange: { _id: 3, owner: 'user-1', secret: 'private' }
    })
    await flush()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].fullDocumentBeforeChange).toEqual({
      _id: 3,
      owner: 'user-1'
    })
    expect(collection.watch.mock.calls[0][1]).toMatchObject({
      fullDocument: 'updateLookup',
      fullDocumentBeforeChange: 'whenAvailable'
    })
  })
  it('applies tenant filters to delete preimages without an unconditional delete alternative', () => {
    const { operators, collection } = fixture(
      [role()],
      [
        {
          name: 'tenant',
          apply_when: {},
          query: { tenant: 'ours', operationType: 'document-property' }
        }
      ]
    )
    operators.watch([{ $match: { operationType: 'delete' } }])
    const [pipeline] = collection.watch.mock.calls[0] as any
    expect(pipeline[0].$match.$or[1]).toEqual({
      $and: [
        { operationType: 'delete' },
        {
          $and: [
            {
              'fullDocumentBeforeChange.tenant': 'ours',
              'fullDocumentBeforeChange.operationType': 'document-property'
            }
          ]
        }
      ]
    })
  })
  it.each([
    { $project: { stolen: '$fullDocument.secret' } },
    { $match: { $expr: { $function: {} } } }
  ])('rejects unsafe caller pipeline %p', (stage) => {
    const { operators, collection } = fixture()
    expect(() => operators.watch([stage])).toThrow()
    expect(collection.watch).not.toHaveBeenCalled()
  })
  it('forwards error events without treating them as documents and removes wrapped listeners', async () => {
    const { operators, stream } = fixture()
    const listener = jest.fn(),
      onError = jest.fn()
    const watched = operators.watch().on('change', listener).on('error', onError)
    const error = new Error('connection closed')
    stream.emit('error', error)
    expect(onError).toHaveBeenCalledWith(error)
    watched.off('change', listener)
    stream.emit('change', change())
    await flush()
    expect(listener).not.toHaveBeenCalled()
  })
  it('forwards rejected async change handlers to the registered error listener', async () => {
    const { operators, stream } = fixture()
    const failure = new Error('async handler failed')
    const onError = jest.fn()
    operators
      .watch()
      .on('change', async () => {
        throw failure
      })
      .on('error', onError)
    stream.emit('change', change())
    await flush()
    expect(onError).toHaveBeenCalledWith(failure)
  })
  it.each(['next', 'tryNext'] as const)(
    'protects %s consumption and hides native internals',
    async (method) => {
      const { operators, stream } = fixture()
      stream[method]
        .mockResolvedValueOnce(change('other-user'))
        .mockResolvedValueOnce(change())
      const watched = operators.watch()
      expect((await watched[method]())?.fullDocument).not.toHaveProperty('secret')
      expect(stream[method]).toHaveBeenCalledTimes(2)
      expect(() => (watched as any).cursor).toThrow('not supported')
    }
  )
  it('protects async iteration', async () => {
    const { operators, stream } = fixture()
    stream.next
      .mockResolvedValueOnce(change('other-user'))
      .mockResolvedValueOnce(change())
    for await (const event of operators.watch()) {
      expect(event.fullDocument).not.toHaveProperty('secret')
      break
    }
    expect(stream.close).toHaveBeenCalled()
  })
})
