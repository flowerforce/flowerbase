import rulesMatcherUtils from '../rules-matcher/utils'
const {
  forceArray,
  isNumber,
  isFunction,
  isString,
  isDate,
  isObject,
  getPath,
  forceNumber,
  getDefaultStringValue,
  getTypeOf
} = rulesMatcherUtils

describe('rulesMatcherUtils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should check all utils', () => {
    // isNumber
    expect(isNumber(2)).toBe(true)
    expect(isNumber('33')).toBe(true)
    expect(isNumber('ciao')).toBe(false)
    expect(isNumber('ciao12')).toBe(false)
    // isFunction
    expect(isFunction(2)).toBe(false)
    expect(isFunction('ciao')).toBe(false)
    expect(isFunction(() => {})).toBe(true)
    expect(isFunction(function test() {})).toBe(true)
    // isString
    expect(isString(2)).toBe(false)
    expect(isString('2')).toBe(true)
    expect(isString('ciao')).toBe(true)
    // isDate
    expect(isDate(2)).toBe(false)
    expect(isDate(new Date())).toBe(true)
    expect(isDate({})).toBe(false)
    // isObject
    expect(isObject({})).toBe(true)
    expect(isObject('test')).toBe(false)
    expect(isObject([])).toBe(true)
    // forceNumber
    expect(forceNumber([1, 2, 3])).toBe(3)
    expect(forceNumber('2')).toBe(2)
    expect(forceNumber('test')).toBe(0)
    // getDefaultStringValue
    expect(getDefaultStringValue('$required')).toEqual({ op: '$exists', value: true })
    expect(getDefaultStringValue('$exists')).toEqual({ op: '$exists', value: true })
    expect(getDefaultStringValue('test')).toEqual({ op: '$eq', value: 'test' })
    // getTypeOf
    expect(getTypeOf([])).toBe('array')
    expect(getTypeOf(2)).toBe('number')
    expect(getTypeOf(null)).toBe(null)
    expect(getTypeOf('test')).toBe(typeof 'test')
    expect(getTypeOf(undefined)).toBe(typeof undefined)
    // forceArray
    expect(forceArray(['test'])).toEqual(['test'])
    expect(forceArray(2)).toEqual([2])
    expect(forceArray({ test: 'test' })).toEqual([{ test: 'test' }])
    // getPath
    expect(getPath('data.name', 'user')).toBe('user.data.name')
    expect(getPath('data.name')).toBe('data.name')
    expect(getPath('^data.name')).toBe('data.name')
    expect(getPath('$data.name')).toBe('$data.name')
  })
})
