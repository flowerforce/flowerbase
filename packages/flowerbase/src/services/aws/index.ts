import { AWSError } from 'aws-sdk'
import Lambda from 'aws-sdk/clients/lambda'
import S3 from 'aws-sdk/clients/s3'
import { PromiseResult } from 'aws-sdk/lib/request'

const accessKeyId = 'GET_THIS_FROM_CONFIG'
const secretAccessKey = 'GET_THIS_FROM_CONFIG'

const Aws = () => {
  return {
    lambda: (region: string) => {
      const lambda = new Lambda({
        region: region,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
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
        credentials: {
          accessKeyId,
          secretAccessKey
        },
        s3ForcePathStyle: true,
        signatureVersion: 'v4'
      })
  }
}

export default Aws
