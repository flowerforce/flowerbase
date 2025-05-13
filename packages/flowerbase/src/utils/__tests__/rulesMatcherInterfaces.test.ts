import {
  RulesModes,
  RulesOperators,
  RulesOperatorsInArray,
  RulesValuesType
} from '../rules-matcher/interface'

describe('Enums and Types', () => {
  it('should have correct values in RulesOperators enum', () => {
    expect(RulesOperators.$exists).toBe('$exists')
    expect(RulesOperators.$eq).toBe('$eq')
    expect(RulesOperators.$ne).toBe('$ne')
    expect(RulesOperators.$gt).toBe('$gt')
    expect(RulesOperators.$gte).toBe('$gte')
    expect(RulesOperators.$lt).toBe('$lt')
    expect(RulesOperators.$lte).toBe('$lte')
    expect(RulesOperators.$strGt).toBe('$strGt')
    expect(RulesOperators.$strGte).toBe('$strGte')
    expect(RulesOperators.$strLt).toBe('$strLt')
    expect(RulesOperators.$strLte).toBe('$strLte')
    expect(RulesOperators.$in).toBe('$in')
    expect(RulesOperators.$nin).toBe('$nin')
    expect(RulesOperators.$all).toBe('$all')
    expect(RulesOperators.$regex).toBe('$regex')
  })

  it('should validate RulesOperatorsInArray type', () => {
    const valid: RulesOperatorsInArray<{ age: number }> = {
      age: {
        $gt: 25
      }
    }
    expect(valid).toHaveProperty('age')
    expect(valid.age).toHaveProperty('$gt', 25)
    const partial: RulesOperatorsInArray<{ name: string }> = {
      name: {
        $eq: 'John Doe'
      }
    }
    expect(partial).toHaveProperty('name')
    expect(partial.name).toHaveProperty('$eq', 'John Doe')
  })

  it('should validate RulesValuesType type', () => {
    const valid: RulesValuesType<{ age: number }> = {
      '$form.isValid': true,
      age: 30
    }
    expect(valid['$form.isValid']).toBe(true)
    expect(valid.age).toBe(30)
    const withoutFormValid: RulesValuesType<{ age: number }> = {
      age: 25
    }
    expect(withoutFormValid['$form.isValid']).toBeUndefined()
    expect(withoutFormValid.age).toBe(25)
  })

  it('should validate RulesModes enum values', () => {
    expect(RulesModes.$and).toBe('$and')
    expect(RulesModes.$or).toBe('$or')
  })
})
