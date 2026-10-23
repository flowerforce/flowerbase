import { createHmac, timingSafeEqual } from 'node:crypto'
import { Readable } from 'node:stream'
import type { preHandlerAsyncHookHandler, preParsingAsyncHookHandler } from 'fastify'
import type { Endpoint } from './interface'

export type EndpointAuthorization = {
  preParsing?: preParsingAsyncHookHandler
  preHandler?: preHandlerAsyncHookHandler
}

type RawPayload = Readable & {
  iterator: (options: { destroyOnReturn: boolean }) => AsyncIterable<unknown>
}

const captureRawBody: preParsingAsyncHookHandler = async (request, _reply, payload) => {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of (payload as RawPayload).iterator({ destroyOnReturn: false })) {
    if (!Buffer.isBuffer(chunk)) {
      throw Object.assign(new Error('Payload verification requires raw request bytes'), { statusCode: 400 })
    }
    length += chunk.length
    if (length > request.routeOptions.bodyLimit) {
      throw Object.assign(new Error('Request body is too large'), { statusCode: 413 })
    }
    chunks.push(chunk)
  }
  const body = Buffer.concat(chunks, length)
  request.rawBody = body
  const stream = Readable.from(body) as Readable & { receivedEncodedLength: number }
  stream.receivedEncodedLength = length
  return stream
}

const secretsEqual = (provided: Buffer, expected: Buffer) =>
  provided.length === expected.length && timingSafeEqual(provided, expected)

export const createEndpointAuthorization = (
  endpoint: Endpoint
): EndpointAuthorization => {
  const { route, validation_method: method, secret_name: secretName } = endpoint
  const unsupportedOption = [
    'can_evaluate',
    'run_as_user_id',
    'run_as_user_id_script_source'
  ].find((option) => typeof endpoint[option as keyof Endpoint] !== 'undefined')
  if (unsupportedOption) {
    throw new Error(`Endpoint "${route}" has unsupported security option "${unsupportedOption}"`)
  }
  if (endpoint.fetch_custom_user_data || endpoint.create_user_on_auth) {
    throw new Error(`Endpoint "${route}" does not support fetch_custom_user_data or create_user_on_auth`)
  }
  if (method === 'NO_VALIDATION') return {}

  if (method !== 'SECRET_AS_QUERY_PARAM' && method !== 'VERIFY_PAYLOAD') {
    throw new Error(`Endpoint "${route}" has unsupported validation_method "${String(method)}"`)
  }
  if (typeof secretName !== 'string' || !secretName.length) {
    throw new Error(`Endpoint "${route}" requires secret_name`)
  }
  const secretValue = process.env[secretName]
  if (typeof secretValue !== 'string' || !secretValue.length) {
    throw new Error(`Endpoint "${route}" requires a non-empty environment secret "${secretName}"`)
  }
  const secret = Buffer.from(secretValue, 'utf8')

  const preHandler: preHandlerAsyncHookHandler = async (request, reply) => {
    let authorized = false
    if (method === 'SECRET_AS_QUERY_PARAM') {
      const query = request.query as { secret?: unknown } | undefined
      authorized = typeof query?.secret === 'string' &&
        secretsEqual(Buffer.from(query.secret, 'utf8'), secret)
    } else {
      const signature = request.headers['endpoint-signature']
      const rawBody = request.rawBody
      if (
        typeof signature === 'string' &&
        /^sha256=[a-fA-F0-9]{64}$/.test(signature) &&
        Buffer.isBuffer(rawBody)
      ) {
        const digest = createHmac('sha256', secret).update(rawBody).digest()
        authorized = secretsEqual(Buffer.from(signature.slice('sha256='.length), 'hex'), digest)
      }
    }
    if (!authorized) {
      reply.code(403).send({ message: 'Forbidden' })
    }
  }
  return method === 'VERIFY_PAYLOAD'
    ? { preParsing: captureRawBody, preHandler }
    : { preHandler }
}
