import { ObjectId } from 'mongodb'
import rulesMatcherUtils from '../rules-matcher/utils'

describe('rule function', () => {
  it('should return valid true if the operator and value match', () => {
    const mockData = {
      user: { name: 'John', age: 25 }
    }
    const mockOptions = { prefix: 'user' }
    const mockValueBlock = { name: { $eq: 'John' } }
    const result = rulesMatcherUtils.rule(mockValueBlock, mockData, mockOptions)
    expect(result.valid).toBe(true)
    expect(result.name).toBe('user.name___$eq')
  })

  it('should return valid false if the operator and value do not match', () => {
    const mockData = {
      user: { name: 'John', age: 25 }
    }
    const mockOptions = { prefix: 'user' }
    const mockValueBlock = { name: { $eq: 'Doe' } }
    const result = rulesMatcherUtils.rule(mockValueBlock, mockData, mockOptions)

    expect(result.valid).toBe(false)
    expect(result.name).toBe('user.name___$eq')
  })

  it('should handle $ref: values correctly', () => {
    const mockData = {
      user: { name: 'John', age: 25 }
    }
    const mockOptions = { prefix: 'user' }
    const mockValueBlock = { name: { $eq: '$ref:user.refName' } }
    const result = rulesMatcherUtils.rule(mockValueBlock, mockData, mockOptions)

    expect(result.valid).toBe(false)
    expect(result.name).toBe('user.name___$eq')
  })

  it('should throw an error if the operator is missing', () => {
    const mockData = {
      user: { name: 'John', age: 25 }
    }
    const mockOptions = { prefix: 'user' }
    const missingOperatorBlock = { name: { $notFoundOperator: 'value' } }
    expect(() => {
      rulesMatcherUtils.rule(missingOperatorBlock, mockData, mockOptions)
    }).toThrow('Error missing operator:$notFoundOperator')
  })

  it('should support %stringToOid with $ref values', () => {
    const companyId = new ObjectId()
    const data = {
      user: {
        _id: companyId
      },
      auth: {
        company: companyId.toHexString()
      }
    }

    const result = rulesMatcherUtils.rule({ _id: { '%stringToOid': '$ref:auth.company' } }, data, {
      prefix: 'user'
    })

    expect(result.valid).toBe(true)
    expect(result.name).toBe('user._id___%stringToOid')
  })

  it('should support %oidToString with $ref values', () => {
    const authId = new ObjectId()
    const data = {
      user: {
        authId: authId.toHexString()
      },
      auth: {
        id: authId
      }
    }

    const result = rulesMatcherUtils.rule({ authId: { '%oidToString': '$ref:auth.id' } }, data, {
      prefix: 'user'
    })

    expect(result.valid).toBe(true)
    expect(result.name).toBe('user.authId___%oidToString')
  })
})
