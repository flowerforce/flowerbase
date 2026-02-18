import { EJSON } from './bson'

const deserialize = <T>(value: T): T => {
  if (!value || typeof value !== 'object') return value
  return EJSON.deserialize(value as Record<string, unknown>) as T
}

export const normalizeFunctionResponse = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return deserialize(parsed)
    } catch {
      return value
    }
  }

  return deserialize(value)
}

export const createFunctionsProxy = (
  callFunction: (name: string, args: unknown[]) => Promise<unknown>,
  callFunctionStreaming: (name: string, args: unknown[]) => Promise<AsyncIterable<Uint8Array>>
): Record<string, (...args: unknown[]) => Promise<unknown>> & {
  callFunction: (name: string, ...args: unknown[]) => Promise<unknown>
  callFunctionStreaming: (name: string, ...args: unknown[]) => Promise<AsyncIterable<Uint8Array>>
} =>
  new Proxy(
    {},
    {
      get: (_, key) => {
        if (typeof key !== 'string') return undefined
        if (key === 'callFunction') {
          return (name: string, ...args: unknown[]) => callFunction(name, args)
        }
        if (key === 'callFunctionStreaming') {
          return (name: string, ...args: unknown[]) => callFunctionStreaming(name, args)
        }
        return (...args: unknown[]) => callFunction(key, args)
      }
    }
  ) as Record<string, (...args: unknown[]) => Promise<unknown>> & {
    callFunction: (name: string, ...args: unknown[]) => Promise<unknown>
    callFunctionStreaming: (name: string, ...args: unknown[]) => Promise<AsyncIterable<Uint8Array>>
  }
