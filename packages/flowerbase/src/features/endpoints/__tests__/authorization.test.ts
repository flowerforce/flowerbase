import { createHmac } from 'node:crypto'
import Fastify, { FastifyInstance } from 'fastify'
import fastifyRawBody from 'fastify-raw-body'
import { generateEndpoints } from '..'
import { Endpoint } from '../interface'
import * as context from '../../../utils/context'

const secretName = 'FLOWERBASE_ENDPOINT_TEST_SECRET'
const secret = 'endpoint-test-secret'
const endpoint: Endpoint = {
  http_method: 'POST',
  route: '/protected',
  function_name: 'handler',
  validation_method: 'SECRET_AS_QUERY_PARAM',
  secret_name: secretName,
  respond_result: true,
  fetch_custom_user_data: false,
  create_user_on_auth: false,
  disabled: false
}
const functionsList = {
  handler: {
    code: 'exports = (request) => ({ ok: true, body: request.body.text() })',
    run_as_system: true
  }
}
const signedHeader = (body: string | Buffer, key = secret) =>
  `sha256=${createHmac('sha256', key).update(body).digest('hex')}`

describe('endpoint authorization', () => {
  let app: FastifyInstance
  const originalSecret = process.env[secretName]
  let execute: jest.SpyInstance

  beforeEach(() => {
    app = Fastify()
    process.env[secretName] = secret
    execute = jest.spyOn(context, 'GenerateContext')
  })

  afterEach(async () => {
    await app.close()
    execute.mockRestore()
    if (typeof originalSecret === 'undefined') delete process.env[secretName]
    else process.env[secretName] = originalSecret
  })

  const register = async (override: Partial<Endpoint> = {}) => {
    await generateEndpoints({ app, functionsList, rulesList: {}, endpointsList: [{ ...endpoint, ...override }] })
  }

  it('executes an explicitly public endpoint without credentials', async () => {
    await register({ validation_method: 'NO_VALIDATION' })
    const response = await app.inject({ method: 'POST', url: '/app/test/endpoint/protected', payload: { value: 1 } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true, body: '{"value":1}' })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each(['', '?secret=wrong', '?secret=endpoint-test-secret&secret=wrong', '?other=endpoint-test-secret'])(
    'rejects an absent, invalid or ambiguous secret: %s',
    async (query) => {
      await register()
      const response = await app.inject({ method: 'POST', url: `/app/test/endpoint/protected${query}`, payload: {} })
      expect(response.statusCode).toBe(403)
      expect(execute).not.toHaveBeenCalled()
    }
  )

  it('executes only when the named environment secret matches', async () => {
    await register()
    const response = await app.inject({ method: 'POST', url: `/app/test/endpoint/protected?secret=${secret}`, payload: {} })
    expect(response.statusCode).toBe(200)
    expect(response.json().ok).toBe(true)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each(['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'protects endpoints registered with method %s',
    async (method) => {
      await register({ http_method: method })
      const response = await app.inject({ method: method === 'ALL' ? 'OPTIONS' : method, url: '/app/test/endpoint/protected' })
      expect(response.statusCode).toBe(403)
      expect(execute).not.toHaveBeenCalled()
    }
  )

  it('verifies the documented HMAC header against the exact raw body', async () => {
    await app.register(fastifyRawBody, { global: false, encoding: 'utf8', runFirst: true, jsonContentTypes: [] })
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const payload = '{ "value" : 1 }'
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload,
      headers: { 'content-type': 'application/json', 'endpoint-signature': signedHeader(payload) }
    })
    expect(response.statusCode).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it.each([
    undefined,
    'sha256=not-hex',
    `sha1=${'a'.repeat(64)}`,
    signedHeader('{ "value" : 1 }', 'wrong-secret'),
    signedHeader('{"value":1}')
  ])('rejects missing, malformed or incorrect payload signatures: %s', async (signature) => {
    await app.register(fastifyRawBody, { global: false, encoding: 'utf8', runFirst: true, jsonContentTypes: [] })
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload: '{ "value" : 1 }',
      headers: { 'content-type': 'application/json', ...(signature ? { 'endpoint-signature': signature } : {}) }
    })
    expect(response.statusCode).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  it('captures exact bytes without depending on an external body capture plugin', async () => {
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const payload = '{"value":1}'
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload,
      headers: { 'content-type': 'application/json', 'endpoint-signature': signedHeader(payload) }
    })
    expect(response.statusCode).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('rejects signatures over decoded text when the raw bytes differ', async () => {
    await app.register(fastifyRawBody, { global: false, encoding: 'utf8', runFirst: true, jsonContentTypes: [] })
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const payload = Buffer.concat([Buffer.from('{"value":"'), Buffer.from([0xff]), Buffer.from('"}')])
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload,
      headers: { 'content-type': 'application/json', 'endpoint-signature': signedHeader(payload.toString('utf8')) }
    })
    expect(response.statusCode).toBe(403)
    expect(execute).not.toHaveBeenCalled()
  })

  it('captures its own bytes when the external body plugin uses decoded text', async () => {
    await app.register(fastifyRawBody, { global: false, encoding: 'utf8', runFirst: true })
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const payload = '{"value":1}'
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload,
      headers: { 'content-type': 'application/json', 'endpoint-signature': signedHeader(payload) }
    })
    expect(response.statusCode).toBe(200)
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('verifies signed plain text without changing the text parser', async () => {
    await app.register(fastifyRawBody, { global: false, encoding: 'utf8', runFirst: true, jsonContentTypes: [] })
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const payload = 'signed plain text: è'
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload,
      headers: { 'content-type': 'text/plain', 'endpoint-signature': signedHeader(payload) }
    })
    expect(response.statusCode).toBe(200)
    expect(response.json().body).toBe(JSON.stringify(payload))
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('enforces the configured body limit while capturing signed bytes', async () => {
    await app.close()
    app = Fastify({ bodyLimit: 8 })
    await register({ validation_method: 'VERIFY_PAYLOAD' })
    const payload = 'body larger than eight bytes'
    const response = await app.inject({
      method: 'POST', url: '/app/test/endpoint/protected', payload,
      headers: { 'content-type': 'text/plain', 'endpoint-signature': signedHeader(payload) }
    })
    expect(response.statusCode).toBe(413)
    expect(execute).not.toHaveBeenCalled()
  })

  it.each([
    { validation_method: undefined },
    { validation_method: 'UNSUPPORTED' },
    { secret_name: undefined },
    { secret_name: 'FLOWERBASE_MISSING_ENDPOINT_SECRET' },
    { can_evaluate: {} },
    { run_as_user_id: 'user-1' },
    { run_as_user_id_script_source: 'return "user-1"' },
    { fetch_custom_user_data: true },
    { create_user_on_auth: true }
  ] as Partial<Endpoint>[])('rejects unsupported or incomplete security configuration: %j', async (override) => {
    await expect(register(override)).rejects.toThrow('Endpoint "/protected"')
    const response = await app.inject({ method: 'POST', url: '/app/test/endpoint/protected', payload: {} })
    expect(response.statusCode).toBe(404)
    expect(execute).not.toHaveBeenCalled()
  })

  it('preflights all security configuration before registering any endpoint', async () => {
    await expect(generateEndpoints({
      app, functionsList, rulesList: {}, endpointsList: [
        { ...endpoint, validation_method: 'NO_VALIDATION', route: '/public' },
        { ...endpoint, secret_name: undefined }
      ]
    })).rejects.toThrow('requires secret_name')
    expect((await app.inject({ method: 'POST', url: '/app/test/endpoint/public' })).statusCode).toBe(404)
  })
})
