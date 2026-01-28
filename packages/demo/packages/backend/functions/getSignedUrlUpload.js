exports = async function (name, mode, campaignId) {
  const s3 = context.services.get("aws").s3("eu-west-1");
  const environment = context.values.get("environment")

  if (!campaignId || !mode || !name) throw new Error('no-campaign-id')

  const presignedUrl = s3.PresignURL({
    "Bucket": `unionesarda-abbonamenti-${environment}-public`,
    "Key": `/campaigns/${campaignId}/${name}.${mode}`,
    "Method": "PUT",
    "ExpirationMS": 900000
  })

  return presignedUrl
};