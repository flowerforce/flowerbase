const logTriggerEvent = async (changeEvent) => {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('triggerEvents')
  const documentId = changeEvent?.documentKey?._id?.toString()
  await collection.insertOne({
    timestamp: new Date().toISOString(),
    operationType: changeEvent?.operationType,
    collection: changeEvent?.ns?.coll,
    documentId,
    payload: changeEvent?.fullDocument
  })
  return { recorded: true, documentId }
}

module.exports = logTriggerEvent
