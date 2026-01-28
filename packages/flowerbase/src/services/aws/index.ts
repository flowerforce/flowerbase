import {
  InvokeAsyncCommand,
  InvokeAsyncCommandInput,
  InvokeAsyncCommandOutput,
  InvokeCommand,
  InvokeCommandInput,
  InvokeCommandOutput,
  Lambda
} from '@aws-sdk/client-lambda'
import {
  GetObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
  PutObjectCommand,
  PutObjectCommandInput,
  PutObjectCommandOutput,
  S3Client
} from '@aws-sdk/client-s3'
import { getSignedUrl as presignGetSignedUrl } from '@aws-sdk/s3-request-presigner'
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

  type PresignOperation = 'getObject' | 'putObject'
  type PresignParams = (GetObjectCommandInput | PutObjectCommandInput) & { Expires?: number }
  type PresignURLParams = (GetObjectCommandInput | PutObjectCommandInput) & {
    Method?: string
    ExpirationMS?: number
    Expires?: number
  }

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
    s3: (region: string) => {
      const client = new S3Client({
        region,
        credentials,
        forcePathStyle: true
      }) as S3Client & {
        PutObject: (params: PutObjectCommandInput) => Promise<PutObjectCommandOutput>
        GetObject: (params: GetObjectCommandInput) => Promise<GetObjectCommandOutput>
        getSignedUrl: (
          operation: PresignOperation,
          params: PresignParams,
          options?: { expiresIn?: number }
        ) => Promise<string>
        PresignURL: (params: PresignURLParams) => Promise<string>
      }

      client.PutObject = async (params: PutObjectCommandInput): Promise<PutObjectCommandOutput> => {
        return client.send(new PutObjectCommand(params))
      }

      client.GetObject = async (params: GetObjectCommandInput): Promise<GetObjectCommandOutput> => {
        return client.send(new GetObjectCommand(params))
      }

      client.getSignedUrl = async (
        operation: PresignOperation,
        params: PresignParams,
        options?: { expiresIn?: number }
      ): Promise<string> => {
        const { Expires, ...rest } = params
        const expiresIn = options?.expiresIn ?? Expires

        if (operation === 'putObject') {
          return presignGetSignedUrl(
            client,
            new PutObjectCommand(rest as PutObjectCommandInput),
            expiresIn ? { expiresIn } : undefined
          )
        }

        return presignGetSignedUrl(
          client,
          new GetObjectCommand(rest as GetObjectCommandInput),
          expiresIn ? { expiresIn } : undefined
        )
      }

      client.PresignURL = async (params: PresignURLParams): Promise<string> => {
        const { Method, ExpirationMS, Expires, ...rest } = params
        const normalizedMethod = Method?.toUpperCase()
        const operation: PresignOperation = normalizedMethod === 'PUT' ? 'putObject' : 'getObject'
        const expiresIn =
          Expires ?? (typeof ExpirationMS === 'number' ? Math.ceil(ExpirationMS / 1000) : undefined)
        const options = typeof expiresIn === 'number' ? { expiresIn } : undefined

        return client.getSignedUrl(operation, rest as PresignParams, options)
      }

      return client
    }
  }
}

export default Aws
