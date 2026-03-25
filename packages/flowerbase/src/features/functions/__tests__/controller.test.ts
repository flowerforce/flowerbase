import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { GenerateContext } from '../../../utils/context'
import { functionsController } from '../controller'

jest.mock('../../../utils/context', () => ({
  GenerateContext: jest.fn()
}))

describe('functionsController', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = Fastify()

    app.decorate('jwtAuthentication', async (request: FastifyRequest, _reply: FastifyReply) => {
      ;(request as any).user = {
        id: '507f191e810c19729de860ea',
        typ: 'access'
      }
    })

    ;(GenerateContext as jest.Mock).mockResolvedValue({ ok: true })

    await app.register(functionsController, {
      functionsList: {
        largePayloadEcho: {
          code: 'exports = () => ({ ok: true })'
        }
      },
      rules: {}
    })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    jest.clearAllMocks()
  })

  it('accepts payloads larger than Fastify default body limit on POST /call', async () => {
    const largeValue = 'x'.repeat(2 * 1024 * 1024)

    const response = await app.inject({
      method: 'POST',
      url: '/call',
      payload: {
        name: 'largePayloadEcho',
        arguments: [{ largeValue }]
      }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ ok: true })
    expect(GenerateContext).toHaveBeenCalledWith(
      expect.objectContaining({
        args: [{ largeValue }]
      })
    )
  })
})
