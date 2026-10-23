import { Document } from 'mongodb'
import { buildAuthorizedReadPipeline } from '../readPipeline'
import { Rules } from '../../../features/rules/interface'
import { Role } from '../../../utils/roles/interface'

const role = (overrides: Partial<Role> = {}): Role => ({
  name: 'reader',
  apply_when: {},
  read: true,
  ...overrides
})
const rules = (roles: Role[] = [role()]): Rules =>
  ({
    documents: { database: 'db', collection: 'documents', roles, filters: [] },
    foreign: { database: 'db', collection: 'foreign', roles: [role()], filters: [] }
  }) as Rules
const build = (pipeline: Document[], config = rules()) =>
  buildAuthorizedReadPipeline({
    pipeline,
    rules: config,
    user: { id: 'user-1' },
    dbName: 'db',
    collName: 'documents'
  })

describe('native authorized aggregation pipeline', () => {
  it('places document authorization and field masking before derived data', () => {
    const pipeline = [{ $group: { _id: '$ownerId', total: { $sum: 1 } } }]
    const result = build(pipeline)
    expect(result[0]).toHaveProperty('$match.$expr')
    expect(result[1]).toHaveProperty('$replaceRoot.newRoot.$arrayToObject.$filter')
    expect(result[2]).toEqual(pipeline[0])
  })

  it('guards simple unionWith and nested lookup before caller projections', () => {
    const result = build([
      { $unionWith: 'foreign' },
      {
        $lookup: {
          from: 'foreign',
          as: 'joined',
          pipeline: [{ $project: { stolen: '$secret' } }]
        }
      }
    ])
    expect(result[2].$unionWith.pipeline[0]).toHaveProperty('$match.$expr')
    expect(result[2].$unionWith.pipeline[1]).toHaveProperty('$replaceRoot')
    expect(result[3].$lookup.pipeline[0]).toHaveProperty('$match.$expr')
    expect(result[3].$lookup.pipeline[2]).toEqual({ $project: { stolen: '$secret' } })
  })

  it('places concise lookup joins after foreign document authorization and masking', () => {
    const result = build([
      {
        $lookup: {
          from: 'foreign',
          localField: 'foreignId',
          foreignField: '_id',
          as: 'joined'
        }
      }
    ])
    expect(result[2].$lookup).not.toHaveProperty('localField')
    expect(result[2].$lookup).not.toHaveProperty('foreignField')
    expect(result[2].$lookup.pipeline[0]).toHaveProperty('$match.$expr')
    expect(result[2].$lookup.pipeline[1]).toHaveProperty('$replaceRoot')
    expect(result[2].$lookup.pipeline[2]).toHaveProperty('$match.$expr.$gt')
  })

  it('does not reapply document roles after a caller transforms a facet branch', () => {
    const branch = [{ $group: { _id: null, total: { $sum: 1 } } }]
    const result = build([{ $facet: { summary: branch } }])
    expect(result[2]).toEqual({ $facet: { summary: branch } })
  })

  it.each(['$out', '$merge', '$graphLookup', '$search', '$documents', '$collStats'])(
    'rejects stage %s explicitly',
    (stage) => expect(() => build([{ [stage]: {} }])).toThrow('cannot compile stage')
  )

  it.each(['$function', '$accumulator', '$where'])(
    'rejects executable %s recursively',
    (operator) => {
      expect(() =>
        build([{ $facet: { nested: [{ $project: { injected: { [operator]: {} } } }] } }])
      ).toThrow(`cannot compile ${operator}`)
    }
  )

  it.each([
    ['function rules', { '%%true': { '%function': { name: 'canRead' } } }],
    ['unsupported rule operator', { '%%root.owner': { $regex: '^user' } }],
    ['dynamic document operand', { '%%root.owner': '%%root.creator' }],
    ['numeric array paths', { '%%root.owners.0': 'user-1' }]
  ])('fails closed for %s', (_description, apply_when) => {
    expect(() => build([], rules([role({ apply_when })]))).toThrow('cannot compile')
  })

  it('requires database-scoped rules for every referenced collection', () => {
    const config = rules()
    config.foreign.database = 'other-db'
    expect(() =>
      build([{ $lookup: { from: 'foreign', as: 'joined', pipeline: [] } }], config)
    ).toThrow('Collection access not permitted')
  })

  it('rejects malformed multi-stage objects without executing either stage', () => {
    expect(() => build([{ $project: { title: 1 }, $out: 'foreign' }])).toThrow(
      'cannot compile stage shape'
    )
  })
})
