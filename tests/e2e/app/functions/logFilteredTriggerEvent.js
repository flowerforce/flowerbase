module.exports = async function (changeEvent) {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('filteredTriggerEvents')
  const documentId = changeEvent?.documentKey?._id?.toString() ?? 'unknown'
  const payload = {
    documentId,
    type: changeEvent?.operationType ?? 'unknown',
    collection: changeEvent?.ns?.coll ?? null,
    fullDocument: changeEvent?.fullDocument ?? null,
    createdAt: new Date().toISOString()
  }
  await collection.insertOne(payload)
  return { recorded: true, documentId }
}
