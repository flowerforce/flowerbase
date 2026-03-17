import { GenerateContext } from '../../../utils/context'
import { generateHandler } from '../utils'

jest.mock('../../../utils/context', () => ({
  GenerateContext: jest.fn()
}))

const mockedGenerateContext = jest.mocked(GenerateContext)

describe('generateHandler', () => {
  beforeEach(() => {
    mockedGenerateContext.mockReset()
  })

  it('allows endpoint functions to set custom response headers', async () => {
    mockedGenerateContext.mockImplementation(async ({ args }) => {
      const [, response] = args as [
        { body: { text: () => string; rawBody: Buffer | string | undefined } },
        {
          setStatusCode: (code: number) => void
          setHeader: (name: string, value: string | number | readonly string[]) => void
          setBody: (body: unknown) => void
        }
      ]

      response.setStatusCode(201)
      response.setHeader('Content-Type', 'application/json')
      response.setHeader('Cache-Control', 'no-store')
      response.setBody(JSON.stringify({ ok: true }))

      return { ignored: true }
    })

    const handler = generateHandler({
      app: {} as any,
      currentFunction: { code: 'module.exports = function () {}' } as any,
      functionName: 'endpointHandler',
      functionsList: {
        endpointHandler: { code: 'module.exports = function () {}' }
      } as any,
      http_method: 'POST',
      rulesList: {} as any
    })

    const res = {
      status: jest.fn(),
      header: jest.fn(),
      send: jest.fn((body) => body)
    } as any

    const response = await handler({
      body: { hello: 'world' },
      headers: { accept: 'application/json' },
      query: { page: '1' },
      rawBody: '{"hello":"world"}',
      user: { id: 'user-1' }
    } as any, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/json')
    expect(res.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
    expect(res.send).toHaveBeenCalledWith(JSON.stringify({ ok: true }))
    expect(response).toBe(JSON.stringify({ ok: true }))
  })
})
