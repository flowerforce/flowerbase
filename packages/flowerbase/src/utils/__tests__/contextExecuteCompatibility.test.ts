import { GenerateContextSync } from '../context'
import { Functions } from '../../features/functions/interface'

const mockServices = {
  api: jest.fn().mockReturnValue({}),
  aws: jest.fn().mockReturnValue({}),
  'mongodb-atlas': jest.fn().mockReturnValue({})
} as any

describe('context.functions.execute compatibility', () => {
  it('returns direct value when target function is synchronous', () => {
    const functionsList = {
      caller: {
        code: 'module.exports = function() { return context.functions.execute("syncTarget") }'
      },
      syncTarget: {
        code: 'module.exports = function() { return { ok: true } }'
      }
    } as Functions

    const result = GenerateContextSync({
      args: [],
      app: {} as any,
      rules: {} as any,
      user: {} as any,
      currentFunction: functionsList.caller,
      functionsList,
      services: mockServices,
      functionName: 'caller'
    })

    expect(result).toEqual({ ok: true })
    expect(result).not.toBeInstanceOf(Promise)
  })

  it('returns Promise when target function is asynchronous', async () => {
    const functionsList = {
      caller: {
        code: 'module.exports = function() { return context.functions.execute("asyncTarget") }'
      },
      asyncTarget: {
        code: 'module.exports = async function() { return { ok: true } }'
      }
    } as Functions

    const result = GenerateContextSync({
      args: [],
      app: {} as any,
      rules: {} as any,
      user: {} as any,
      currentFunction: functionsList.caller,
      functionsList,
      services: mockServices,
      functionName: 'caller'
    })

    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toEqual({ ok: true })
  })
})
