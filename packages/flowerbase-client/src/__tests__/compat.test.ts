import * as Flowerbase from '../index'

describe('flowerbase-client compatibility surface', () => {
  it('exposes Realm-like symbols', () => {
    expect(typeof Flowerbase.App).toBe('function')
    expect(typeof Flowerbase.App.getApp).toBe('function')
    expect(Flowerbase.App.Credentials).toBe(Flowerbase.Credentials)
    expect(typeof Flowerbase.Credentials.emailPassword).toBe('function')
    expect(typeof Flowerbase.Credentials.anonymous).toBe('function')
    expect(typeof Flowerbase.Credentials.function).toBe('function')
    expect(typeof Flowerbase.Credentials.jwt).toBe('function')
    expect(typeof Flowerbase.MongoDBRealmError).toBe('function')
    expect(typeof Flowerbase.BSON.ObjectId).toBe('function')
    expect(Flowerbase.ObjectID).toBe(Flowerbase.ObjectId)
  })

  it('returns singleton app for same id', () => {
    const a1 = Flowerbase.App.getApp('singleton-app')
    const a2 = Flowerbase.App.getApp('singleton-app')
    expect(a1).toBe(a2)
  })
})
