import { ensureClientPipelineStages, getHiddenFieldsFromRulesConfig, prependUnsetStage, applyAccessControlToPipeline, mergeProjections } from '../utils'
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

    it('does not hide fields that are write-only in the rules config', () => {
      const roles: Role[] = [
        {
          name: 'internal',
          apply_when: {},
          insert: true,
          delete: true,
          search: true,
          read: true,
          write: true,
          fields: {
            name: { write: true },
            address: { write: true },
            secret: { read: false, write: false }
          }
        }
      ]

      const hidden = getHiddenFieldsFromRulesConfig({
        roles
      })

      expect(hidden).toContain('secret')
      expect(hidden).not.toContain('name')
      expect(hidden).not.toContain('address')
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

  describe('mergeProjections', () => {
    it('returns undefined when both sides are empty', () => {
      expect(mergeProjections(undefined, undefined)).toBeUndefined()
      expect(mergeProjections({}, null)).toBeUndefined()
    })

    it('returns the client projection when rules have none', () => {
      expect(mergeProjections({ a: 1, b: 1 }, null)).toEqual({ a: 1, b: 1 })
    })

    it('normalizes the rules projection when client has none', () => {
      // Mixed inclusion/exclusion rules are normalized to pure inclusion mode.
      expect(
        mergeProjections(undefined, { item: 1, status: 1, instock: 0 })
      ).toEqual({ item: 1, status: 1 })
    })

    it('merges plain inclusion projections (rules wins on conflict)', () => {
      expect(
        mergeProjections(
          { item: 1, price: 1 },
          { item: 1, status: 1 }
        )
      ).toEqual({ item: 1, status: 1, price: 1 })
    })

    it('supports dotted client keys alongside plain rules keys', () => {
      expect(
        mergeProjections(
          { price: 1 },
          { item: 1, status: 1, 'instock.qty': 1 }
        )
      ).toEqual({ item: 1, status: 1, 'instock.qty': 1, price: 1 })
    })

    it('drops client dotted keys when rules exclude the top-level field', () => {
      // Rules: include item/status, exclude the whole `instock` subtree.
      // Client tries to read `instock.qty` — it must be stripped.
      expect(
        mergeProjections(
          { item: 1, status: 1, 'instock.qty': 1 },
          { item: 1, status: 1, instock: 0 }
        )
      ).toEqual({ item: 1, status: 1 })
    })

    it('drops every client inclusion whose top-level is excluded by rules', () => {
      expect(
        mergeProjections(
          {
            item: 1,
            'instock.qty': 1,
            'instock.warehouse': 1,
            price: 1
          },
          { item: 1, instock: 0 }
        )
      ).toEqual({ item: 1, price: 1 })
    })

    it('produces pure exclusion output when neither side has inclusions', () => {
      expect(
        mergeProjections({ secretA: 0 }, { secretB: 0 })
      ).toEqual({ secretA: 0, secretB: 0 })
    })

    it('drops non-_id client exclusions when switching to inclusion mode', () => {
      // Can't mix `{ price: 0, item: 1 }` in MongoDB — rules force inclusion
      // mode so the client exclusion is silently dropped (price is implicitly
      // excluded because it is not included).
      expect(
        mergeProjections({ price: 0 }, { item: 1 })
      ).toEqual({ item: 1 })
    })

    it('keeps _id: 0 alongside inclusion mode', () => {
      expect(
        mergeProjections({ _id: 0 }, { item: 1 })
      ).toEqual({ _id: 0, item: 1 })
      expect(
        mergeProjections({ item: 1 }, { _id: 0 })
      ).toEqual({ _id: 0, item: 1 })
    })
  })
})
