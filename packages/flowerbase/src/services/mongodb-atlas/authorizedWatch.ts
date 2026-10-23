import { Readable } from 'node:stream'
import { ChangeStream, Document } from 'mongodb'
import cloneDeep from 'lodash/cloneDeep'

/** Keep every change-stream consumption API behind the same document check. */
export const authorizeWatch = (
  stream: ChangeStream,
  authorize: (change: Document) => Promise<Document | undefined>
): ChangeStream => {
  const listeners = new Map<string, Map<Function, Set<(...args: any[]) => void>>>()
  let wrapped: ChangeStream
  const next = async (nonBlocking = false): Promise<Document | null> => {
    for (;;) {
      const change = nonBlocking ? await stream.tryNext() : await stream.next()
      if (!change) return null
      const document = await authorize(change)
      if (document) return document
    }
  }
  const iterator = async function* () {
    try {
      while (!stream.closed) {
        const change = await next()
        if (change) yield change
      }
    } finally {
      await stream.close()
    }
  }
  const on = (event: string, listener: (...args: any[]) => void, once = false) => {
    if (event !== 'change') {
      const callback = (...args: any[]) => listener.apply(wrapped, args)
      const events = listeners.get(event) ?? new Map()
      const registered = events.get(listener) ?? new Set()
      registered.add(callback)
      events.set(listener, registered)
      listeners.set(event, events)
      if (once) stream.once(event, callback)
      else stream.on(event, callback)
      return wrapped
    }
    const validated = (change: Document) => {
      void authorize(change)
        .then((document) => {
          if (!document || !listeners.get(event)?.get(listener)?.has(validated)) return
          if (once) off(event, listener)
          return listener.call(wrapped, document)
        })
        .catch((error) => stream.emit('error', error))
    }
    const events = listeners.get(event) ?? new Map()
    const registered = events.get(listener) ?? new Set()
    registered.add(validated)
    events.set(listener, registered)
    listeners.set(event, events)
    stream.on('change', validated)
    return wrapped
  }
  const off = (event: string, listener: (...args: any[]) => void) => {
    for (const callback of listeners.get(event)?.get(listener) ?? [])
      stream.off(event, callback)
    listeners.get(event)?.delete(listener)
    return wrapped
  }
  wrapped = new Proxy(Object.create(null), {
    get: (_target, property) => {
      if (property === 'next') return () => next()
      if (property === 'tryNext') return () => next(true)
      if (property === Symbol.asyncIterator) return iterator
      if (property === 'stream')
        return () => Readable.from({ [Symbol.asyncIterator]: iterator })
      if (property === 'on' || property === 'addListener') return on
      if (property === 'once')
        return (event: string, listener: (...args: any[]) => void) =>
          on(event, listener, true)
      if (property === 'off' || property === 'removeListener') return off
      if (property === 'removeAllListeners')
        return (event?: string) => {
          if (event === undefined) {
            listeners.clear()
            stream.removeAllListeners()
          } else {
            listeners.delete(event)
            stream.removeAllListeners(event)
          }
          return wrapped
        }
      if (property === 'close') return () => stream.close()
      if (property === 'closed' || property === 'resumeToken')
        return cloneDeep(stream[property])
      // Driver internals include an unguarded cursor and collection. Do not expose them.
      if (property === 'then') return undefined
      throw new Error(`Change stream property ${String(property)} is not supported`)
    },
    set: () => {
      throw new Error('Authorized change stream state cannot be modified directly')
    },
    defineProperty: () => {
      throw new Error('Authorized change stream state cannot be modified directly')
    }
  })
  return wrapped
}
