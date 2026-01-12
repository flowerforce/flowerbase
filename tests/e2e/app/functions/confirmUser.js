module.exports = async function ({ tokenId, username }) {
  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('triggerEvents')
  await collection.insertOne({
    documentId: username,
    type: 'user_confirmation',
    email: username,
    tokenId,
    createdAt: new Date().toISOString()
  })

  if (typeof username === 'string' && username.includes('pending')) {
    return { status: 'pending' }
  }
  if (typeof username === 'string' && username.includes('fail')) {
    return { status: 'fail' }
  }
  return { status: 'success' }
}
