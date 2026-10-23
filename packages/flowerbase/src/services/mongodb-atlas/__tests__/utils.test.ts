import {
  mergeProjections,
  getValidRule
} from '../utils'

describe('MongoDB Atlas aggregate helpers', () => {
  describe('getValidRule', () => {
    it('matches legacy scalar apply_when syntax against array-valued custom data', () => {
      const validRules = getValidRule({
        filters: [
          {
            apply_when: {
              '%%user.custom_data.roles': 'Admin'
            },
            query: {}
          }
        ] as any,
        user: {
          custom_data: {
            roles: ['Admin', 'SCM']
          }
        } as any,
        record: null
      })

      expect(validRules).toHaveLength(1)
    })

    it('does not match legacy scalar apply_when syntax when the array does not contain the value', () => {
      const validRules = getValidRule({
        filters: [
          {
            apply_when: {
              '%%user.custom_data.roles': 'Admin'
            },
            query: {}
          }
        ] as any,
        user: {
          custom_data: {
            roles: ['Editor']
          }
        } as any,
        record: null
      })

      expect(validRules).toHaveLength(0)
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
