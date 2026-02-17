jest.mock('node:diagnostics_channel', () => {
  const createChannel = () => ({
    publish: jest.fn(),
    subscribe: jest.fn()
  })
  return {
    channel: jest.fn(createChannel),
    tracingChannel: () => ({
      asyncStart: createChannel(),
      asyncEnd: createChannel(),
      error: createChannel()
    })
  }
})

import fastify, { FastifyInstance, FastifyReply } from 'fastify'
import jwtAuthPlugin from './jwt'
import { ObjectId } from 'bson'

const SECRET = 'test-secret'

const createAccessRequest = (payload: { typ: 'access'; sub: string; iat: number }) => {
  const request: Record<string, unknown> = {}
  request.jwtVerify = jest.fn(async () => {
    request.user = payload
  })
  return request
}

describe('jwtAuthentication', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    app = fastify()
    await app.register(jwtAuthPlugin, { secret: SECRET })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  const unauthorizedSessionError = {
    message: 'Unauthorized',
    error: 'unauthorized',
    errorCode: 'InvalidSession',
    error_code: 'InvalidSession'
  }

  const setupMongo = (userPayload: { _id: ObjectId; lastLogoutAt?: Date }) => {
    const findOneMock = jest.fn().mockResolvedValue(userPayload)
    const collectionMock = { findOne: findOneMock }
    const dbMock = { collection: jest.fn().mockReturnValue(collectionMock) }
    const mongoMock = { client: { db: jest.fn().mockReturnValue(dbMock) } }
    ;(app as any).mongo = mongoMock
  }

  const createReply = () => {
    return {
      code: jest.fn().mockReturnThis(),
      send: jest.fn()
    } as unknown as FastifyReply
  }

  it('allows access tokens issued after the last logout', async () => {
    const userId = new ObjectId()
    const nowSeconds = Math.floor(Date.now() / 1000)
    setupMongo({ _id: userId, lastLogoutAt: new Date((nowSeconds - 30) * 1000) })

    const request = createAccessRequest({
      typ: 'access',
      sub: userId.toHexString(),
      iat: nowSeconds
    })
    const reply = createReply()

    await app.jwtAuthentication(request as any, reply)

    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('rejects access tokens issued before the last logout', async () => {
    const userId = new ObjectId()
    const nowSeconds = Math.floor(Date.now() / 1000)
    setupMongo({ _id: userId, lastLogoutAt: new Date((nowSeconds + 30) * 1000) })

    const request = createAccessRequest({
      typ: 'access',
      sub: userId.toHexString(),
      iat: nowSeconds
    })
    const reply = createReply()

    await app.jwtAuthentication(request as any, reply)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith(unauthorizedSessionError)
  })

  it('returns Realm-compatible unauthorized payload when jwt verification fails', async () => {
    const request = {
      jwtVerify: jest.fn(async () => {
        throw new Error('jwt expired')
      })
    }
    const reply = createReply()

    await app.jwtAuthentication(request as any, reply)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith(unauthorizedSessionError)
  })
})
