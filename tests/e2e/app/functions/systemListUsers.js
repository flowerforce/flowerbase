module.exports = async function () {
  const mongoService = context.services.get('mongodb-atlas')
  const usersCollection = mongoService.db('flowerbase-e2e').collection('users')
  const users = await usersCollection
    .find({})
    .project({ email: 1, userId: 1, _id: 0 })
    .toArray()
  return {
    count: users.length,
    users
  }
}
