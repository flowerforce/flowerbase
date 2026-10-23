import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { Document } from 'mongodb'
import { authorizeAggregate } from '../authorizedAggregate'
import { authorizeWatch } from '../authorizedWatch'

class Cursor extends EventEmitter {
  pipeline: Document[] = [{ $match: { authorized: true } }]
  cursorClient = { secret: 'native-client' }
  namespace = { db: 'app', collection: 'public' }
  closed = false
  transform?: (document: Document) => unknown
  documents: Document[] = [{ authorized: true, value: 1 }]
  addStage(stage: Document) { this.pipeline.push(stage); return this }
  map(transform: (document: Document) => unknown) { this.transform = transform; return this }
  async next() {
    const document = this.documents.shift()
    return document && this.transform ? this.transform.call(this, document) : document
  }
  async tryNext() { return this.next() }
  async forEach(callback: (document: unknown) => unknown) {
    for await (const document of this) callback.call(this, document)
  }
  async *[Symbol.asyncIterator]() {
    while (this.documents.length) yield await this.next()
  }
  stream() { return Object.assign(Readable.from(this), { _cursor: this }) }
  async close() { this.closed = true; this.emit('close') }
  clone() { return new Cursor() }
}

class Watch extends EventEmitter {
  pipeline: Document[] = []
  parent = { secret: 'native-collection' }
  cursor = { secret: 'native-cursor' }
  closed = false
  resumeToken = { _data: 'resume-position' }
  documents: Document[] = [{ fullDocument: { authorized: true } }]
  async next() {
    const change = this.documents.shift() ?? null
    if (!this.documents.length) this.closed = true
    return change
  }
  async tryNext() { return this.next() }
  async close() { this.closed = true; this.emit('close') }
}

const wrappers = () => {
  const cursor = new Cursor()
  const watch = new Watch()
  return [
    { name: 'aggregate', native: cursor, wrapper: authorizeAggregate(cursor as never, (pipeline) => pipeline) },
    { name: 'watch', native: watch, wrapper: authorizeWatch(watch as never, async (document) => document) }
  ]
}

describe('authorization wrappers keep native driver state private', () => {
  it.each(['aggregate', 'watch'])('%s hides native references from reflection', (kind) => {
    const { wrapper } = wrappers().find(({ name }) => name === kind)!
    expect(Reflect.ownKeys(wrapper)).toEqual([])
    expect(Object.getOwnPropertyDescriptors(wrapper)).toEqual({})
    expect(Object.getOwnPropertyDescriptor(wrapper, 'pipeline')).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(wrapper, 'cursorClient')).toBeUndefined()
    expect(Object.getOwnPropertyDescriptor(wrapper, 'parent')).toBeUndefined()
    expect(Object.getPrototypeOf(wrapper)).toBeNull()
  })

  it.each(['aggregate', 'watch'])('%s prevents direct pipeline replacement and defineProperty', (kind) => {
    const { wrapper, native } = wrappers().find(({ name }) => name === kind)!
    const originalPipeline = [...native.pipeline]
    expect(() => { (wrapper as any).pipeline = [{ $unionWith: 'secret' }] }).toThrow()
    expect(() => Object.defineProperty(wrapper, 'pipeline', { value: [] })).toThrow()
    expect(native.pipeline).toEqual(originalPipeline)
  })

  it.each(['aggregate', 'watch'])('%s keeps the wrapper as callback receiver for error and close events', (kind) => {
    const { wrapper, native } = wrappers().find(({ name }) => name === kind)!
    for (const event of ['error', 'close']) {
      let receiver: unknown
      ;(wrapper as any).once(event, function (this: unknown) { receiver = this })
      native.emit(event, event === 'error' ? new Error('driver error') : undefined)
      expect(receiver).toBe(wrapper)
      expect(receiver).not.toBe(native)
    }
  })

  it.each(['aggregate', 'watch'])('%s keeps the native emitter out of newListener callbacks', (kind) => {
    const { wrapper, native } = wrappers().find(({ name }) => name === kind)!
    let receiver: unknown
    ;(wrapper as any).on('newListener', function (this: unknown) { receiver = this })
    ;(wrapper as any).on('close', () => {})
    expect(receiver).toBe(wrapper)
    expect(receiver).not.toBe(native)
  })

  it('does not expose the native watch as the receiver of an authorized change callback', async () => {
    const native = new Watch()
    const wrapper = authorizeWatch(native as never, async (change) => change)
    let receiver: unknown
    const delivered = new Promise<void>((resolve) => {
      wrapper.once('change', function (this: unknown) { receiver = this; resolve() })
    })
    native.emit('change', { fullDocument: { authorized: true } })
    await delivered
    expect(receiver).toBe(wrapper)
    expect(receiver).not.toBe(native)
  })

  it('does not expose the native aggregate cursor through map callback this', async () => {
    const native = new Cursor()
    const wrapper = authorizeAggregate(native as never, (pipeline) => pipeline)
    let receiver: unknown
    const mapped = wrapper.map(function (this: unknown, document) { receiver = this; return document })
    expect(mapped).toBe(wrapper)
    expect(await mapped.next()).toEqual({ authorized: true, value: 1 })
    expect(receiver).toBe(wrapper)
    expect(receiver).not.toBe(native)
  })

  it('does not expose the native aggregate cursor through forEach callback this', async () => {
    const native = new Cursor()
    const wrapper = authorizeAggregate(native as never, (pipeline) => pipeline)
    let receiver: unknown
    await wrapper.forEach(function (this: unknown) { receiver = this })
    expect(receiver).toBe(wrapper)
    expect(receiver).not.toBe(native)
  })

  it('does not expose the native aggregate cursor through readable streams', async () => {
    const native = new Cursor()
    const nativeStream = jest.spyOn(native, 'stream')
    const wrapper = authorizeAggregate(native as never, (pipeline) => pipeline)
    const stream = wrapper.stream()
    expect((stream as any)._cursor).toBeUndefined()
    expect(nativeStream).not.toHaveBeenCalled()
    const documents = []
    for await (const document of stream) documents.push(document)
    expect(documents).toEqual([{ authorized: true, value: 1 }])
  })

  it('does not expose native watch state through readable streams', async () => {
    const native = new Watch()
    const wrapper = authorizeWatch(native as never, async (change) => change)
    const stream = wrapper.stream()
    expect((stream as any)._cursor).toBeUndefined()
    expect((stream as any).cursor).toBeUndefined()
    const documents = []
    for await (const document of stream) documents.push(document)
    expect(documents).toEqual([{ fullDocument: { authorized: true } }])
  })

  it('does not allow callers to replace the aggregate collection by mutating namespace', () => {
    const native = new Cursor()
    const wrapper = authorizeAggregate(native as never, (pipeline) => pipeline)
    const namespace = wrapper.namespace
    expect(namespace).not.toBe(native.namespace)
    try { (namespace as any).collection = 'secret' } catch (error) { expect(error).toBeInstanceOf(TypeError) }
    expect(native.namespace.collection).toBe('public')
  })
})
