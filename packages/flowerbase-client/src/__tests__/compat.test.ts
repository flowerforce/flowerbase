import * as Flowerbase from '../index'

describe('flowerbase-client compatibility surface', () => {
  it('exposes Realm-like symbols', () => {
    expect(typeof Flowerbase.App).toBe('function')
    expect(typeof Flowerbase.Credentials.emailPassword).toBe('function')
    expect(typeof Flowerbase.Credentials.anonymous).toBe('function')
    expect(typeof Flowerbase.Credentials.function).toBe('function')
    expect(typeof Flowerbase.BSON.ObjectId).toBe('function')
    expect(Flowerbase.ObjectID).toBe(Flowerbase.ObjectId)
  })
})
