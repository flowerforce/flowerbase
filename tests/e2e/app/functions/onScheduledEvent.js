module.exports = async function () {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('triggerEvents')
  const documentId = 'scheduled-trigger'
  await collection.insertOne({
    documentId,
    type: 'scheduled',
    createdAt: new Date().toISOString()
  })
  return { recorded: true, documentId }
}
