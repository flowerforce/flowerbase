import rulesMatcherUtils from '../rules-matcher/utils'

describe('getKeys', () => {
  it('should handle $and operator correctly', () => {
    expect(rulesMatcherUtils.getKeys(undefined)).toBe(null)
    expect(rulesMatcherUtils.getKeys(() => {})).toEqual([])
    // NOTE -> this cast is forced to test a case that should never be verified
    expect(
      rulesMatcherUtils.getKeys('test' as unknown as Record<string, unknown>)
    ).toEqual(null)
  })
})
