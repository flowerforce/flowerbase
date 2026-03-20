const baseUrl = 'http://localhost:3000'
const appId = 'flowerbase-demo'

describe('mobile demo e2e', () => {
  beforeAll(async () => {
    const major = Number(process.versions.node.split('.')[0])
    if (major < 20) {
      throw new Error(`Node ${process.versions.node} is not supported for mobile Jest E2E. Use Node 20+.`)
    }

    const response = await fetch(`${baseUrl}/app/${appId}/endpoint/webhooks/searchTodos`, {
      method: 'POST'
    }).catch(() => null)

    if (!response || !response.ok) {
      throw new Error(`Demo backend is not reachable at ${baseUrl}. Start packages/demo/packages/backend first.`)
    }
  })

  it('covers register, login, CRUD and password reset', async () => {
    const { App, Credentials, BSON } = require('@flowerforce/flowerbase-client')

    const email = `expo-e2e-${Date.now()}@example.com`
    const password = 'secret123'
    const nextPassword = 'secret456'
    const app = new App({ id: appId, baseUrl })

    await app.emailPasswordAuth.registerUser({ email, password })

    const user = await app.logIn(Credentials.emailPassword(email, password))
    expect(user.id).toBe(app.currentUser.id)

    const collection = user.mongoClient('mongodb-atlas').db('flowerbase-demo').collection('todos')

    await collection.insertOne({
      title: 'E2E todo',
      status: 'todo',
      userId: user.id,
      secureNote: 'initial note',
      createdAt: new Date(),
      updatedAt: new Date()
    })

    const createdTodos = await collection.find({ userId: user.id })
    expect(Array.isArray(createdTodos)).toBe(true)
    expect(createdTodos).toHaveLength(1)

    const todoId = String(createdTodos[0]._id)

    await collection.updateOne(
      { _id: new BSON.ObjectId(todoId) },
      {
        $set: {
          title: 'E2E todo updated',
          status: 'done',
          secureNote: 'updated note',
          updatedAt: new Date()
        }
      }
    )

    const updatedTodo = await collection.findOne({ _id: new BSON.ObjectId(todoId) })
    expect(updatedTodo.title).toBe('E2E todo updated')
    expect(updatedTodo.status).toBe('done')
    expect(updatedTodo.secureNote).toBe('updated note')

    await collection.deleteOne({ _id: new BSON.ObjectId(todoId) })
    const todosAfterDelete = await collection.find({ userId: user.id })
    expect(todosAfterDelete).toEqual([])

    await app.emailPasswordAuth.sendResetPasswordEmail(email)

    const previewResponse = await fetch(
      `${baseUrl}/app/${appId}/endpoint/demo-reset-preview?email=${encodeURIComponent(email)}`
    )
    const preview = await previewResponse.json()

    expect(previewResponse.status).toBe(200)
    expect(typeof preview.token).toBe('string')
    expect(typeof preview.tokenId).toBe('string')

    await app.emailPasswordAuth.resetPassword({
      token: preview.token,
      tokenId: preview.tokenId,
      password: nextPassword
    })

    await app.currentUser.logOut()
    expect(app.currentUser).toBeNull()

    const reloggedUser = await app.logIn(Credentials.emailPassword(email, nextPassword))
    expect(reloggedUser.id).toBe(user.id)
  })
})
