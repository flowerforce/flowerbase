module.exports = async function () {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('auth_users')
  const users = await collection.find({}).toArray()
  return { users }
}
