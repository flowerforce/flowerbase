module.exports = function (base64EncodedImage) {
  const currentUser = context.user
  const binaryImageData = BSON.Binary.fromBase64(base64EncodedImage, 0);
  const s3Service = context.services.get('aws').s3('eu-west-1');

  return s3Service.PutObject({
    'Bucket': 'giornaliera-public',
    'Key': `users/${currentUser.id}/avatar`,
    'ContentType': 'png',
    'Body': binaryImageData
  })
    .then(putObjectOutput => ({
      uri: `https://giornaliera-public.s3-eu-west-1.amazonaws.com/users/${currentUser.id}/avatar`
    })
    )
    .catch((err) => ({ error: err.message }));
};