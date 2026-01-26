module.exports = async function (changeEvent) {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('filteredUpdateTriggerEvents')
  const documentId = changeEvent?.documentKey?._id?.toString() ?? 'unknown'
  await collection.insertOne({
    documentId,
    type: changeEvent?.operationType ?? 'unknown',
    collection: changeEvent?.ns?.coll ?? null,
    fullDocument: changeEvent?.fullDocument ?? null,
    fullDocumentBeforeChange: changeEvent?.fullDocumentBeforeChange ?? null,
    updateDescription: changeEvent?.updateDescription ?? null,
    createdAt: new Date().toISOString()
  })
  return { recorded: true, documentId }
}
