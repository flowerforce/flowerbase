import rulesMatcherUtils from '../rules-matcher/utils'

describe('getKey function', () => {
  it('should handle a basic rule correctly', () => {
    const mockKeys = {}
    const mockOptions = { prefix: 'user' }
    const block = { name: { $eq: 'John' } }
    const response = rulesMatcherUtils.getKey(block, mockKeys, mockOptions)
    expect(response).toBe(true)
    expect(mockKeys).toEqual({ 'user.name': true })
  })
})
