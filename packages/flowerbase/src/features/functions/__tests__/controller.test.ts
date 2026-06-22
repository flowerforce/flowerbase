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

  it('reconstructs realm-web flattened options (sort/limit/project) into the options arg', async () => {
    const cursor: any = {
      sort: jest.fn(() => cursor),
      skip: jest.fn(() => cursor),
      limit: jest.fn(() => cursor),
      toArray: () => Promise.resolve([])
    }
    const find = jest.fn().mockReturnValue(cursor)
    services['mongodb-atlas'] = jest.fn(() => ({
      db: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({ find })
      })
    })) as any

    const response = await app.inject({
      method: 'POST',
      url: '/call',
      payload: {
        service: 'mongodb-atlas',
        name: 'find',
        arguments: [
          {
            database: 'app',
            collection: 'todos',
            query: { archived: false },
            // realm-web flattens these to the top level; `projection` is `project`
            sort: { createdAt: -1 },
            limit: 5,
            project: { name: 1 }
          }
        ]
      }
    })

    expect(response.statusCode).toBe(200)
    const [, , passedOptions] = find.mock.calls[0]
    expect(passedOptions).toEqual(
      expect.objectContaining({
        sort: { createdAt: -1 },
        limit: 5,
        projection: { name: 1 }
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
