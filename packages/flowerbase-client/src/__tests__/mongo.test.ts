import { ObjectId } from 'bson'
import { App } from '../app'
import { Credentials } from '../credentials'

describe('flowerbase-client mongo service wrapper', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('maps CRUD calls to mongodb-atlas service payload', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          access_token: 'access',
          refresh_token: 'refresh',
          user_id: 'user-1'
        })
      })
      .mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ ok: true })
      }) as unknown as typeof fetch

    const app = new App({ id: 'my-app', baseUrl: 'http://localhost:3000' })
    await app.logIn(Credentials.emailPassword('john@doe.com', 'secret123'))

    const collection = app.currentUser!.mongoClient('mongodb-atlas').db('testdb').collection('todos')

    await collection.find({ done: false })
    await collection.findOne({ done: false })
    await collection.insertOne({ title: 'new task' })
    await collection.updateOne({ _id: new ObjectId('507f1f77bcf86cd799439011') }, { $set: { done: true } })
    await collection.updateMany({ done: false }, { $set: { done: true } })
    await collection.deleteOne({ done: true })

    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(7)
    const [url, request] = (global.fetch as jest.Mock).mock.calls[2]
    expect(url).toBe('http://localhost:3000/api/client/v2.0/app/my-app/functions/call')
    expect(request.method).toBe('POST')
    const parsed = JSON.parse(request.body)
    expect(parsed.service).toBe('mongodb-atlas')
    expect(parsed.name).toBe('findOne')
  })
})
