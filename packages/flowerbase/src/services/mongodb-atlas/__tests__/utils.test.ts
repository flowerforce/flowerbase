import { ensureClientPipelineStages, getHiddenFieldsFromRulesConfig, prependUnsetStage, applyAccessControlToPipeline } from '../utils'
import { Role } from '../../../utils/roles/interface'

describe('MongoDB Atlas aggregate helpers', () => {
  describe('ensureClientPipelineStages', () => {
    it('allows safe stages', () => {
      expect(() =>
        ensureClientPipelineStages([{ $match: { active: true } }])
      ).not.toThrow()
    })

    it('throws when unsupported stage is used', () => {
      expect(() =>
        ensureClientPipelineStages([{ $replaceRoot: { newRoot: '$$ROOT' } }])
      ).toThrow('Stage $replaceRoot is not allowed in client aggregate pipelines')
    })

    it('recurses into nested lookups and facets without throwing', () => {
      const pipeline = [
        {
          $lookup: {
            from: 'other',
            localField: 'ref',
            foreignField: '_id',
            as: 'joined',
            pipeline: [
              {
                $facet: {
                  safe: [{ $match: { foo: 'bar' } }]
                }
              }
            ]
          }
        }
      ]

      expect(() => ensureClientPipelineStages(pipeline)).not.toThrow()
    })
  })

  describe('getHiddenFieldsFromRulesConfig', () => {
    it('returns fields marked as unreadable', () => {
      const roles: Role[] = [
        {
          name: 'demo',
          apply_when: {},
          insert: true,
          delete: true,
          search: true,
          read: true,
          write: true,
          fields: {
            secret: { read: false, write: false },
            visible: { read: true, write: false }
          },
          additional_fields: {
            hiddenExtra: { read: false, write: false }
          }
        }
      ]

      const hidden = getHiddenFieldsFromRulesConfig({
        roles
      })

      expect(hidden).toEqual(expect.arrayContaining(['secret', 'hiddenExtra']))
      expect(hidden).not.toContain('visible')
    })
  })

  describe('prependUnsetStage', () => {
    it('inserts an $unset stage when hidden fields are present', () => {
      const pipeline = [{ $match: { active: true } }]
      const result = prependUnsetStage(pipeline, ['password', 'secret'])

      expect(result[0]).toEqual({ $unset: ['password', 'secret'] })
      expect(result[1]).toEqual(pipeline[0])
    })

    it('returns original pipeline if no hidden fields exist', () => {
      const pipeline = [{ $match: { active: true } }]
      expect(prependUnsetStage(pipeline, [])).toEqual(pipeline)
    })
  })

  describe('applyAccessControlToPipeline', () => {
    it('prepends hidden-field $unset inside lookup pipelines for client requests', () => {
      const rules = {
        main: {
          filters: [],
          roles: []
        },
        other: {
          filters: [],
          roles: [
            {
              name: 'lookup-role',
              apply_when: {},
              insert: true,
              delete: true,
              search: true,
              read: true,
              write: true,
              fields: {
                secretField: { read: false, write: false }
              },
              additional_fields: {
                secretAux: { read: false, write: false }
              }
            }
          ]
        }
      }

      const pipeline = [
        {
          $lookup: {
            from: 'other',
            localField: 'ref',
            foreignField: '_id',
            as: 'joined',
            pipeline: [{ $match: { active: true } }]
          }
        }
      ]

      const sanitized = applyAccessControlToPipeline(
        pipeline,
        rules,
        {},
        'main',
        { isClientPipeline: true }
      )

      const lookupPipeline = sanitized[0].$lookup.pipeline
      expect(lookupPipeline?.[0]).toEqual({
        $unset: ['secretField', 'secretAux']
      })
    })
  })
})
