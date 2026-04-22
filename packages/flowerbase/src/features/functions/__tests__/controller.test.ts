import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { services } from '../../../services'
import { GenerateContext } from '../../../utils/context'
import { functionsController } from '../controller'

jest.mock('../../../utils/context', () => ({
  GenerateContext: jest.fn()
}))

describe('functionsController', () => {
  let app: FastifyInstance
  const originalMongoService = services['mongodb-atlas']

  beforeEach(async () => {
    app = Fastify()

    app.decorate('jwtAuthentication', async (request: FastifyRequest, _reply: FastifyReply) => {
      ; (request as any).user = {
        id: '507f191e810c19729de860ea',
        typ: 'access'
      }
    })

      ; (GenerateContext as jest.Mock).mockResolvedValue({ ok: true })

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
    services['mongodb-atlas'] = originalMongoService
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

  it('passes mongodb-atlas distinct service arguments through POST /call', async () => {
    const distinct = jest.fn().mockResolvedValue(['open'])
    services['mongodb-atlas'] = jest.fn(() => ({
      db: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          distinct
        })
      })
    })) as any

    const response = await app.inject({
      method: 'POST',
      url: '/call',
      payload: {
        service: 'mongodb-atlas',
        name: 'distinct',
        arguments: [
          {
            database: 'app',
            collection: 'todos',
            key: 'status',
            query: { archived: false },
            options: { maxTimeMS: 250 }
          }
        ]
      }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual(['open'])
    expect(distinct).toHaveBeenCalledWith(
      'status',
      { archived: false },
      { maxTimeMS: 250 }
    )
  })
})
