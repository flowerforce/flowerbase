import { ObjectId } from 'mongodb'
import { operators } from '../rules-matcher/utils'

describe('operators', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should check equals values', () => {
    expect(operators.$eq('a', 'a')).toBe(true)
    expect(!operators.$eq('a', 'b')).toBe(true)
    const id = new ObjectId()
    expect(operators.$eq(id, id.toHexString())).toBe(true)
    expect(operators.$eq(id, new ObjectId(id.toHexString()))).toBe(true)
  })
  it('should check different values', () => {
    expect(operators.$ne('a', 'a')).toBe(false)
    expect(operators.$ne('a', 'b')).toBe(true)
    const id = new ObjectId()
    expect(operators.$ne(id, id.toHexString())).toBe(false)
  })
  it('should check string length values', () => {
    // test $strGt
    expect(operators.$strGt('test', 2)).toBe(true)
    expect(operators.$strGt('test', 15)).toBe(false)
    expect(operators.$strGt('test', 4)).toBe(false)
    // test $strGte
    expect(operators.$strGte('test', 2)).toBe(true)
    expect(operators.$strGte('test', 15)).toBe(false)
    expect(operators.$strGte('test', 4)).toBe(true)
    // test $strLt
    expect(operators.$strLt('test', 2)).toBe(false)
    expect(operators.$strLt('test', 15)).toBe(true)
    expect(operators.$strLt('test', 4)).toBe(false)
    // test $strLte
    expect(operators.$strLte('test', 2)).toBe(false)
    expect(operators.$strLte('test', 15)).toBe(true)
    expect(operators.$strLte('test', 4)).toBe(true)
  })
  it('should check if a value exists', () => {
    expect(operators.$exists({ name: 1 }, true)).toBe(true)
    expect(operators.$exists({}, false)).toBe(true)
    expect(operators.$exists({}, true)).toBe(false)
    expect(operators.$exists(undefined, false)).toBe(true)
    expect(operators.$exists(null, true)).toBe(false)
    expect(operators.$exists('', true)).toBe(false)
    expect(operators.$exists('test', true)).toBe(true)
    expect(operators.$exists(0, true)).toBe(true)
    expect(operators.$exists([], true)).toBe(false)
    expect(operators.$exists([1], true)).toBe(true)
    expect(operators.$exists(new Date(), true)).toBe(true)
    expect(operators.$exists(() => {}, true)).toBe(true)
  })
  it('should compare numbers', () => {
    // test $gt
    expect(operators.$gt(2, 3)).toBe(false)
    expect(operators.$gt(2, 2)).toBe(false)
    expect(operators.$gt(3, 2)).toBe(true)
    // test $gte
    expect(operators.$gte(2, 3)).toBe(false)
    expect(operators.$gte(2, 2)).toBe(true)
    expect(operators.$gte(3, 2)).toBe(true)
    // test $lt
    expect(operators.$lt(2, 3)).toBe(true)
    expect(operators.$lt(2, 2)).toBe(false)
    expect(operators.$lt(3, 2)).toBe(false)
    // test $lte
    expect(operators.$lte(2, 3)).toBe(true)
    expect(operators.$lte(2, 2)).toBe(true)
    expect(operators.$lte(3, 2)).toBe(false)
  })
  it('should find a value in an array', () => {
    expect(operators.$in(2, [3])).toBe(false)
    expect(operators.$in(3, [3, 4, 5])).toBe(true)
    expect(operators.$in([3, 4], [3, 4, 5])).toBe(true)
    expect(operators.$in([3, 6], [3, 4, 5])).toBe(true)
    expect(operators.$in({ name: 'ciao' }, [{ name: 'ciao' }, 4, 5])).toBe(false)
    const id = new ObjectId()
    expect(operators.$in(id, [id.toHexString()])).toBe(true)
  })
  it("should check if a value isn't in an array", () => {
    expect(operators.$nin(2, [3])).toBe(true)
    expect(operators.$nin(3, [3, 4, 5])).toBe(false)
    expect(operators.$nin([3, 4], [3, 4, 5])).toBe(false)
    expect(operators.$nin([3, 6], [3, 4, 5])).toBe(false)
    expect(operators.$nin({ name: 'ciao' }, [{ name: 'ciao' }, 4, 5])).toBe(true)
    const id = new ObjectId()
    expect(operators.$nin(id, [id.toHexString()])).toBe(false)
  })
  it('should find all values in an array', () => {
    expect(operators.$all(2, [3])).toBe(false)
    expect(operators.$all(3, [3, 4, 5])).toBe(false)
    expect(operators.$all([3], [3, 4, 5])).toBe(false)
    expect(operators.$all([3, 4, 5], [3, 4, 5])).toBe(true)
    expect(operators.$all([3, 6], [3, 4, 5])).toBe(false)
    expect(operators.$all({ name: 'ciao' }, [{ name: 'ciao' }, 4, 5])).toBe(false)
    expect(operators.$all([{ name: 'ciao' }, 4, 5], [{ name: 'ciao' }, 4, 5])).toBe(false)
    const id = new ObjectId()
    expect(operators.$all([id], [id.toHexString()])).toBe(true)
  })
  it('should check array size', () => {
    expect(operators.$size([1, 2, 3], 3)).toBe(true)
    expect(operators.$size([1, 2, 3], 2)).toBe(false)
    expect(operators.$size([], 0)).toBe(true)
    expect(operators.$size('not-array', 0)).toBe(false)
  })
  it('should check regex', () => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
    expect(operators.$regex('test@gmail.com', emailRegex)).toBe(true)
    expect(operators.$regex('test.com', emailRegex)).toBe(false)
    const numberRegex = /^\d+$/
    expect(operators.$regex('1234567890', numberRegex)).toBe(true)
    expect(operators.$regex('12345r', numberRegex)).toBe(false)
  })

  it('should support %stringToOid conversion operator', () => {
    const id = new ObjectId()
    expect(operators['%stringToOid'](id, id.toHexString())).toBe(true)
    expect(operators['%stringToOid'](id, 'not-an-object-id')).toBe(false)
  })

  it('should support %oidToString conversion operator', () => {
    const id = new ObjectId()
    expect(operators['%oidToString'](id.toHexString(), id)).toBe(true)
    expect(operators['%oidToString']('not-matching', id)).toBe(false)
  })
})
