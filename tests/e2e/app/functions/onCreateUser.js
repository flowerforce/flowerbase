module.exports = async function (payload) {
  const user = payload?.user ?? payload
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('triggerEvents')
  const documentId = user?.id?.toString() ?? 'unknown'
  await collection.insertOne({
    documentId,
    type: 'on_user_creation',
    email: user?.email ?? user?.data?.email ?? null,
    createdAt: new Date().toISOString()
  })
  return { recorded: true, documentId }
}
