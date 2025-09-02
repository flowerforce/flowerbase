import { AWSError, Credentials } from 'aws-sdk'
import Lambda from 'aws-sdk/clients/lambda'
import S3 from 'aws-sdk/clients/s3'
import { PromiseResult } from 'aws-sdk/lib/request'
import { S3_CONFIG } from '../../constants'


const Aws = () => {

  const credentials = {
    accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
  } as Credentials

  return {
    lambda: (region: string) => {
      const lambda = new Lambda({
        region: region,
        credentials
      }) as Lambda & {
        Invoke: (
          ...args: Parameters<Lambda['invoke']>
        ) => Promise<PromiseResult<Lambda.InvocationResponse, AWSError>>
        InvokeAsync: Lambda['invokeAsync']
      }
      lambda.Invoke = async (...args: Parameters<Lambda['invoke']>) => {
        const res = await lambda.invoke(...args).promise()
        return {
          ...res,
          Payload: {
            text: () => res.Payload
          }
        }
      }
      lambda.InvokeAsync = lambda.invokeAsync
      return lambda
    },
    s3: (region: string) =>
      new S3({
        region,
        apiVersion: '2006-03-01',
        credentials,
        s3ForcePathStyle: true,
        signatureVersion: 'v4'
      })
  }
}

export default Aws
