module.exports = async function (changeEvent) {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('triggerEvents')
  const documentId = changeEvent?.documentKey?._id?.toString() ?? 'unknown'
  await collection.insertOne({
    documentId,
    type: changeEvent?.operationType ?? 'unknown',
    collection: changeEvent?.ns?.coll ?? null,
    createdAt: new Date().toISOString()
  })
  return { recorded: true, documentId }
}
