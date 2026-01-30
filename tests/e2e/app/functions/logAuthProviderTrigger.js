const logAuthProviderTrigger = async (payload) => {
  const user = payload?.user ?? payload
  const identities = Array.isArray(user?.identities) ? user.identities : []
  const providerTypes = identities
    .map((identity) => identity?.provider_type)
    .filter((provider) => typeof provider === 'string')
  const providerType = providerTypes[0] ?? (typeof user?.provider_type === 'string' ? user.provider_type : 'unknown')
  const operationType = typeof payload?.operationType === 'string' ? payload.operationType : 'unknown'
  const documentId = user?.id?.toString?.() ?? user?.data?._id?.toString?.() ?? 'unknown'

  const mongoService = context.services.get('mongodb-atlas')
  const collection = mongoService.db('flowerbase-e2e').collection('providerTriggerEvents')
  await collection.insertOne({
    documentId,
    type: `auth_provider_${operationType.toLowerCase()}_${providerType}`,
    operationType,
    provider: providerType,
    providers: providerTypes,
    createdAt: new Date().toISOString()
  })

  return { recorded: true, documentId }
}

module.exports = logAuthProviderTrigger
