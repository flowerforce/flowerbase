jest.mock('../../../services', () => ({ services: { 'mongodb-atlas': jest.fn() } }))

import { EventEmitter } from 'node:events'
import { EJSON } from 'bson'
import Fastify from 'fastify'
import { ObjectId } from 'mongodb'
import { services } from '../../../services'
import { functionsController } from '../controller'

class Response extends EventEmitter {
  writableEnded = false
  destroyed = false
  writeHead = jest.fn()
  flushHeaders = jest.fn()
  write = jest.fn()
  end = jest.fn(() => {
    this.writableEnded = true
    this.emit('close')
  })
}

type User = {
  _id: ObjectId
  status: string
  sessionVersion: number
}

type Stream = EventEmitter & { close: jest.Mock }

describe('watch stream authentication lifetime', () => {
  const originalService = services['mongodb-atlas']
  let app: any
  let user: User
  let users: User[]
  let findAuthUser: jest.Mock
  let findReadableDocument: jest.Mock
  let streams: Stream[]
  let responses: Response[]
  let onWatchOpened: (() => void) | undefined
  let handler: (req: any, res: any) => Promise<unknown>

  const payload = (overrides: Record<string, unknown> = {}) => ({
    typ: 'access', id: user._id.toString(), sub: user._id.toString(),
    sessionVersion: user.sessionVersion, exp: Math.floor(Date.now() / 1000) + 60,
    data: { role: 'reader' }, custom_data: { role: 'reader' }, user_data: { role: 'reader' },
    ...overrides
  })

  const open = async (token = payload()) => {
    const raw = new Response()
    responses.push(raw)
    const res = { raw, status: jest.fn().mockReturnThis(), hijack: jest.fn() }
    const config = Buffer.from(JSON.stringify({
      service: 'mongodb-atlas', name: 'watch', arguments: [{ database: 'app', collection: 'things' }]
    })).toString('base64')
    const result = await handler({ user: token, query: { baas_request: config } }, res)
    return { res, raw, result }
  }

  const emitChange = async (stream = streams[0]) => {
    const listeners = stream.listeners('change')
    for (const listener of listeners) {
      await listener({ operationType: 'insert', documentKey: { _id: 'doc' }, fullDocument: { _id: 'doc', value: 1 } })
    }
  }

  beforeEach(async () => {
    jest.useFakeTimers({
      now: new Date('2026-10-23T12:00:00.000Z'),
      doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask']
    })
    user = { _id: new ObjectId(), status: 'confirmed', sessionVersion: 0 }
    users = [user]
    streams = []
    responses = []
    onWatchOpened = undefined
    findAuthUser = jest.fn(async ({ _id }: { _id: ObjectId }) => {
      const match = users.find((candidate) => candidate._id.equals(_id))
      return match ? { ...match } : null
    })
    findReadableDocument = jest.fn(async () => ({ _id: 'doc', value: 1 }))
    services['mongodb-atlas'] = jest.fn(() => ({
      db: () => ({
        collection: () => ({
          watch: () => {
            const stream = Object.assign(new EventEmitter(), { close: jest.fn(async () => {}) })
            streams.push(stream)
            onWatchOpened?.()
            return stream
          },
          findOne: findReadableDocument
        })
      })
    })) as never
    app = {
      mongo: { client: { db: () => ({ collection: () => ({ findOne: findAuthUser }) }) } },
      addHook: jest.fn(), post: jest.fn(),
      get: jest.fn((_path: string, _options: unknown, callback: typeof handler) => { handler = callback })
    }
    await functionsController(app, { functionsList: {}, rules: {} })
  })

  afterEach(async () => {
    responses.forEach((response) => response.end())
    await Promise.resolve()
    services['mongodb-atlas'] = originalService
    jest.useRealTimers()
  })

  it('delivers readable events while the signed access session is active', async () => {
    const { raw, res } = await open()
    await emitChange()
    expect(res.hijack).toHaveBeenCalledTimes(1)
    expect(raw.write).toHaveBeenCalledTimes(1)
    const event = EJSON.parse(raw.write.mock.calls[0][0].slice('data: '.length).trim())
    expect(event.fullDocument).toEqual({ _id: 'doc', value: 1 })
    expect(raw.end).not.toHaveBeenCalled()
  })

  it.each(['sub', 'exp', 'sessionVersion'])('rejects a stream missing its mandatory %s claim', async (claim) => {
    const { res, raw } = await open(payload({ [claim]: undefined }))
    expect(res.status).toHaveBeenCalledWith(401)
    expect(raw.writeHead).not.toHaveBeenCalled()
    expect(streams).toHaveLength(0)
  })

  it('rejects an expired access token before opening the underlying stream', async () => {
    const { res } = await open(payload({ exp: Math.floor(Date.now() / 1000) }))
    expect(res.status).toHaveBeenCalledWith(401)
    expect(streams).toHaveLength(0)
  })

  it('blocks the next event and closes the stream after logout', async () => {
    const { raw } = await open()
    user.sessionVersion += 1
    await emitChange()
    expect(raw.write).not.toHaveBeenCalled()
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(streams[0].close).toHaveBeenCalledTimes(1)
    expect(streams[0].listenerCount('change')).toBe(0)
    expect(streams[0].listenerCount('error')).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('closes an idle stream after its session is revoked without relying on client disconnect', async () => {
    const { raw } = await open()
    user.sessionVersion += 1
    await jest.advanceTimersByTimeAsync(1000)
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(streams[0].close).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('closes an idle stream when the account is disabled', async () => {
    const { raw } = await open()
    user.status = 'disabled'
    await jest.advanceTimersByTimeAsync(1000)
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(raw.write).not.toHaveBeenCalled()
    expect(streams[0].close).toHaveBeenCalledTimes(1)
  })

  it('closes an idle stream when its account is removed', async () => {
    const { raw } = await open()
    users.length = 0
    await jest.advanceTimersByTimeAsync(1000)
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(streams[0].close).toHaveBeenCalledTimes(1)
  })

  it('ends the response at token expiry even when no database event arrives', async () => {
    const { raw } = await open(payload({ exp: Math.floor(Date.now() / 1000) + 1 }))
    await jest.advanceTimersByTimeAsync(1000)
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(streams[0].close).toHaveBeenCalledTimes(1)
    expect(raw.listenerCount('close')).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('rechecks authentication if logout happens during the readability lookup', async () => {
    const { raw } = await open()
    findReadableDocument.mockImplementationOnce(async () => {
      user.sessionVersion += 1
      return { _id: 'doc', value: 1 }
    })
    await emitChange()
    expect(raw.write).not.toHaveBeenCalled()
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(streams[0].close).toHaveBeenCalledTimes(1)
  })

  it('fails closed if the authentication database becomes unavailable', async () => {
    const { raw } = await open()
    findAuthUser.mockRejectedValueOnce(new Error('database unavailable'))
    await emitChange()
    expect(raw.write).not.toHaveBeenCalled()
    expect(raw.end).toHaveBeenCalledTimes(1)
    expect(streams[0].close).toHaveBeenCalledTimes(1)
  })

  it('does not share authorization state between users with identical permission data', async () => {
    const first = await open()
    const secondUser = { _id: new ObjectId(), status: 'confirmed', sessionVersion: 0 }
    users.push(secondUser)
    const second = await open(payload({ id: secondUser._id.toString(), sub: secondUser._id.toString() }))
    expect(streams).toHaveLength(2)
    user.sessionVersion += 1
    await emitChange(streams[0])
    await emitChange(streams[1])
    expect(first.raw.write).not.toHaveBeenCalled()
    expect(first.raw.end).toHaveBeenCalledTimes(1)
    expect(second.raw.write).toHaveBeenCalledTimes(1)
    expect(second.raw.end).not.toHaveBeenCalled()
  })

  it('does not reuse a hub across access token expiry boundaries', async () => {
    await open()
    await open(payload({ exp: Math.floor(Date.now() / 1000) + 120 }))
    expect(streams).toHaveLength(2)
  })

  it('does not reuse a hub from a revoked session version', async () => {
    const first = await open()
    user.sessionVersion += 1
    const second = await open()
    expect(streams).toHaveLength(2)
    await emitChange(streams[0])
    await emitChange(streams[1])
    expect(first.raw.end).toHaveBeenCalledTimes(1)
    expect(second.raw.write).toHaveBeenCalledTimes(1)
  })

  it('shares a valid session hub and releases timers and listeners when the final client disconnects', async () => {
    const first = await open()
    const second = await open()
    expect(streams).toHaveLength(1)
    first.raw.end()
    await Promise.resolve()
    expect(streams[0].close).not.toHaveBeenCalled()
    second.raw.end()
    await Promise.resolve()
    expect(streams[0].close).toHaveBeenCalledTimes(1)
    expect(streams[0].listenerCount('change')).toBe(0)
    expect(streams[0].listenerCount('error')).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('keeps a real Fastify SSE response open until server-side revocation closes it', async () => {
    const server = Fastify()
    server.decorate('mongo', app.mongo)
    server.decorate('jwtAuthentication', async (request) => {
      request.user = payload() as never
    })
    await server.register(functionsController, { functionsList: {}, rules: {} })
    await server.ready()
    const opened = new Promise<void>((resolve) => { onWatchOpened = resolve })
    const config = Buffer.from(JSON.stringify({
      service: 'mongodb-atlas', name: 'watch', arguments: [{ database: 'app', collection: 'things' }]
    })).toString('base64')
    const responsePromise = server.inject({ url: `/call?baas_request=${encodeURIComponent(config)}` }).then((value) => value)
    await opened
    expect(streams[0].close).not.toHaveBeenCalled()
    user.sessionVersion += 1
    await jest.advanceTimersByTimeAsync(1000)
    const response = await responsePromise
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('text/event-stream')
    expect(response.body).toBe('')
    expect(streams[0].close).toHaveBeenCalledTimes(1)
    await server.close()
  })
})
