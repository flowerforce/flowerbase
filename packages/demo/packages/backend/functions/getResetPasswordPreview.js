module.exports = async function (payload, response) {
  const email = payload?.query?.email

  if (!email || typeof email !== 'string') {
    response.setStatusCode(400)
    return { message: 'Missing email query parameter' }
  }

  const resetRequest = await context.services
    .get('mongodb-atlas')
    .db('flowerbase-demo')
    .collection('reset_password_requests')
    .findOne({ email })

  if (!resetRequest) {
    response.setStatusCode(404)
    return { message: 'No reset request found for this email' }
  }

  return {
    email,
    token: resetRequest.token,
    tokenId: resetRequest.tokenId,
    createdAt: resetRequest.createdAt
  }
}
