import {
  InvokeAsyncCommand,
  InvokeAsyncCommandInput,
  InvokeAsyncCommandOutput,
  InvokeCommand,
  InvokeCommandInput,
  InvokeCommandOutput,
  Lambda
} from '@aws-sdk/client-lambda'
import { S3 } from '@aws-sdk/client-s3'
import { S3_CONFIG } from '../../constants'

type LambdaInvokeResponse = Omit<InvokeCommandOutput, 'Payload'> & {
  Payload: {
    text: () => string | undefined
  }
}

const decodePayload = (payload?: Uint8Array): string | undefined => {
  if (!payload) {
    return undefined
  }

  return Buffer.from(payload).toString('utf-8')
}

const Aws = () => {
  const credentials =
    S3_CONFIG.ACCESS_KEY_ID && S3_CONFIG.SECRET_ACCESS_KEY
      ? {
        accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
        secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY
      }
      : undefined

  return {
    lambda: (region: string) => {
      const lambda = new Lambda({
        region: region,
        credentials
      }) as Lambda & {
        Invoke: (params: InvokeCommandInput) => Promise<LambdaInvokeResponse>
        InvokeAsync: (params: InvokeAsyncCommandInput) => Promise<InvokeAsyncCommandOutput>
      }

      lambda.Invoke = async (params: InvokeCommandInput): Promise<LambdaInvokeResponse> => {
        const res = await lambda.send(new InvokeCommand(params))
        return {
          ...res,
          Payload: {
            text: () => decodePayload(res.Payload)
          }
        }
      }

      const invokeAsync = async (
        params: InvokeAsyncCommandInput
      ): Promise<InvokeAsyncCommandOutput> => {
        return lambda.send(new InvokeAsyncCommand(params))
      }

      lambda.InvokeAsync = invokeAsync
      lambda.invokeAsync = invokeAsync

      return lambda
    },
    s3: (region: string) =>
      new S3({
        region,
        credentials,
        forcePathStyle: true
      })
  }
}

export default Aws
