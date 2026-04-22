import { GenerateContextSync } from '../context'
import { Functions } from '../../features/functions/interface'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mockServices = {
  api: jest.fn().mockReturnValue({}),
  aws: jest.fn().mockReturnValue({}),
  'mongodb-atlas': jest.fn((_app, options) => options ?? {})
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

    expect(result && typeof (result as Promise<unknown>).then).toBe('function')
    await expect(result).resolves.toEqual({ ok: true })
  })

  it('passes circular native objects without EJSON deserialization', () => {
    const functionsList = {
      caller: {
        code: `
          module.exports = function() {
            const session = { tx: true }
            session.client = { sessionPool: { client: session } }
            return context.functions.execute("target", session)
          }
        `
      },
      target: {
        code: `
          module.exports = function(session) {
            return session.client.sessionPool.client === session
          }
        `
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

    expect(result).toBe(true)
  })

  it('propagates run_as_system to child functions executed through context.functions.execute', () => {
    const functionsList = {
      caller: {
        run_as_system: true,
        code: 'module.exports = function() { return context.functions.execute("target") }'
      },
      target: {
        run_as_system: false,
        code: 'module.exports = function() { return context.services.get("mongodb-atlas").run_as_system }'
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

    expect(result).toBe(true)
  })

  it('loads same-directory helper modules for sandboxed functions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowerbase-context-'))
    const helperPath = path.join(tempDir, 'getFreightRate.ts')

    fs.writeFileSync(
      helperPath,
      'export function getFreightRate([address, amount, freightRateValues]) { return { address, total: amount * freightRateValues.multiplier } }'
    )

    const functionsList = {
      caller: {
        sourcePath: path.join(tempDir, 'caller.ts'),
        code: `
          import { getFreightRate } from './getFreightRate'

          module.exports = function() {
            return getFreightRate(['rome', 4, { multiplier: 2.5 }])
          }
        `
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

    expect(result).toEqual({ address: 'rome', total: 10 })
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
})
