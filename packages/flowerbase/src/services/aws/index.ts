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
import { emitServiceEvent } from '../monitoring'

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

const Aws = (_app?: unknown, opt?: { monitoring?: { invokedFrom?: string } }) => {
  const origin = opt?.monitoring?.invokedFrom
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
        const meta = { operation: 'Invoke', region, functionName: params.FunctionName }
        emitServiceEvent({
          type: 'aws',
          source: 'service:aws',
          message: 'aws lambda Invoke',
          data: meta,
          origin
        })
        try {
          const res = await lambda.send(new InvokeCommand(params))
          return {
            ...res,
            Payload: {
              text: () => decodePayload(res.Payload)
            }
          }
        } catch (error) {
          emitServiceEvent({
            type: 'aws',
            source: 'service:aws',
            message: 'aws lambda Invoke failed',
            data: meta,
            error,
            origin
          })
          throw error
        }
      }

      const invokeAsync = async (
        params: InvokeAsyncCommandInput
      ): Promise<InvokeAsyncCommandOutput> => {
        const meta = { operation: 'InvokeAsync', region, functionName: params.FunctionName }
        emitServiceEvent({
          type: 'aws',
          source: 'service:aws',
          message: 'aws lambda InvokeAsync',
          data: meta,
          origin
        })
        try {
          return await lambda.send(new InvokeAsyncCommand(params))
        } catch (error) {
          emitServiceEvent({
            type: 'aws',
            source: 'service:aws',
            message: 'aws lambda InvokeAsync failed',
            data: meta,
            error,
            origin
          })
          throw error
        }
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
        const meta = { operation: 'PutObject', region, bucket: params.Bucket, key: params.Key }
        emitServiceEvent({
          type: 'aws',
          source: 'service:aws',
          message: 'aws s3 PutObject',
          data: meta,
          origin
        })
        try {
          return await client.send(new PutObjectCommand(params))
        } catch (error) {
          emitServiceEvent({
            type: 'aws',
            source: 'service:aws',
            message: 'aws s3 PutObject failed',
            data: meta,
            error,
            origin
          })
          throw error
        }
      }

      client.GetObject = async (params: GetObjectCommandInput): Promise<GetObjectCommandOutput> => {
        const meta = { operation: 'GetObject', region, bucket: params.Bucket, key: params.Key }
        emitServiceEvent({
          type: 'aws',
          source: 'service:aws',
          message: 'aws s3 GetObject',
          data: meta,
          origin
        })
        try {
          return await client.send(new GetObjectCommand(params))
        } catch (error) {
          emitServiceEvent({
            type: 'aws',
            source: 'service:aws',
            message: 'aws s3 GetObject failed',
            data: meta,
            error,
            origin
          })
          throw error
        }
      }

      client.getSignedUrl = async (
        operation: PresignOperation,
        params: PresignParams,
        options?: { expiresIn?: number }
      ): Promise<string> => {
        const { Expires, ...rest } = params
        const expiresIn = options?.expiresIn ?? Expires
        const meta = {
          operation: 'getSignedUrl',
          region,
          bucket: (params as { Bucket?: string }).Bucket,
          key: (params as { Key?: string }).Key,
          method: operation
        }
        emitServiceEvent({
          type: 'aws',
          source: 'service:aws',
          message: 'aws s3 getSignedUrl',
          data: meta,
          origin
        })

        if (operation === 'putObject') {
          try {
            return await presignGetSignedUrl(
              client,
              new PutObjectCommand(rest as PutObjectCommandInput),
              expiresIn ? { expiresIn } : undefined
            )
          } catch (error) {
            emitServiceEvent({
              type: 'aws',
              source: 'service:aws',
              message: 'aws s3 getSignedUrl failed',
              data: meta,
              error,
              origin
            })
            throw error
          }
        }

        try {
          return await presignGetSignedUrl(
            client,
            new GetObjectCommand(rest as GetObjectCommandInput),
            expiresIn ? { expiresIn } : undefined
          )
        } catch (error) {
          emitServiceEvent({
            type: 'aws',
            source: 'service:aws',
            message: 'aws s3 getSignedUrl failed',
            data: meta,
            error,
            origin
          })
          throw error
        }
      }

      client.PresignURL = async (params: PresignURLParams): Promise<string> => {
        const { Method, ExpirationMS, Expires, ...rest } = params
        const normalizedMethod = Method?.toUpperCase()
        const operation: PresignOperation = normalizedMethod === 'PUT' ? 'putObject' : 'getObject'
        const expiresIn =
          Expires ?? (typeof ExpirationMS === 'number' ? Math.ceil(ExpirationMS / 1000) : undefined)
        const options = typeof expiresIn === 'number' ? { expiresIn } : undefined

        const meta = {
          operation: 'PresignURL',
          region,
          bucket: (params as { Bucket?: string }).Bucket,
          key: (params as { Key?: string }).Key,
          method: operation
        }
        emitServiceEvent({
          type: 'aws',
          source: 'service:aws',
          message: 'aws s3 PresignURL',
          data: meta,
          origin
        })
        try {
          return await client.getSignedUrl(operation, rest as PresignParams, options)
        } catch (error) {
          emitServiceEvent({
            type: 'aws',
            source: 'service:aws',
            message: 'aws s3 PresignURL failed',
            data: meta,
            error,
            origin
          })
          throw error
        }
      }

      return client
    }
  }
}

export default Aws
