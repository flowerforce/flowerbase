jest.mock('node:diagnostics_channel', () => {
  const channel = () => ({ publish: jest.fn(), subscribe: jest.fn() })
  return {
    channel: jest.fn(channel),
    tracingChannel: () => ({ asyncStart: channel(), asyncEnd: channel(), error: channel() })
  }
})

jest.mock('../../constants', () => ({
  AUTH_CONFIG: {
    authCollection: 'auth_users',
    refreshTokensCollection: 'refresh_tokens',
    resetPasswordCollection: 'reset_password_requests',
    userCollection: 'users',
    user_id_field: 'id',
    authProviders: {
      'local-userpass': { disabled: false },
      'custom-function': { disabled: false, config: { authFunctionName: 'authenticate' } }
    },
    resetPasswordConfig: { runResetFunction: true, resetFunctionName: 'reset' },
    localUserpassConfig: { autoConfirm: true, runConfirmationFunction: true, confirmationFunctionName: 'confirm' }
  },
  AUTH_DB_NAME: 'auth',
  DB_NAME: 'data',
  DEFAULT_CONFIG: {
    REFRESH_TOKEN_TTL_DAYS: 1,
    RESET_PASSWORD_TTL_SECONDS: 3600,
    AUTH_RATE_LIMIT_WINDOW_MS: 60000,
    AUTH_LOGIN_MAX_ATTEMPTS: 1000,
    AUTH_REGISTER_MAX_ATTEMPTS: 1000,
    AUTH_RESET_MAX_ATTEMPTS: 1000
  }
}))

jest.mock('../../state', () => ({
  StateManager: { select: jest.fn(() => ({ authenticate: {}, reset: {}, confirm: {} })) }
}))

jest.mock('../../utils/context', () => ({ GenerateContext: jest.fn() }))

import fastify, { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { AUTH_CONFIG } from '../../constants'
import { authController } from '../controller'
import jwtAuthPlugin from '../plugins/jwt'
import { customFunctionController } from '../providers/custom-function/controller'
import { localUserPassController } from '../providers/local-userpass/controller'
import { registerUserRoutes } from '../../monitoring/routes/users'
import { GenerateContext } from '../../utils/context'
import { comparePassword, hashPassword, hashToken } from '../../utils/crypto'

type RecordDoc = Record<string, any>

const equal = (left: unknown, right: unknown) =>
  left instanceof ObjectId && right instanceof ObjectId
    ? left.equals(right)
    : left === right

const matches = (doc: RecordDoc, selector: RecordDoc): boolean =>
  Object.entries(selector).every(([key, value]) => {
    if (value && typeof value === 'object' && '$elemMatch' in value) {
      return Array.isArray(doc[key]) && doc[key].some((item: RecordDoc) => matches(item, value.$elemMatch))
    }
    if (value && typeof value === 'object' && '$gt' in value) return doc[key] > value.$gt
    return equal(doc[key], value)
  })

const update = (doc: RecordDoc, mutation: RecordDoc) => {
  Object.assign(doc, mutation.$set)
  for (const [key, value] of Object.entries(mutation.$inc ?? {})) doc[key] = (doc[key] ?? 0) + Number(value)
  for (const key of Object.keys(mutation.$unset ?? {})) delete doc[key]
}

const createStore = () => {
  const documents: Record<string, RecordDoc[]> = {
    auth_users: [], refresh_tokens: [], reset_password_requests: [], users: []
  }
  const collections = Object.fromEntries(Object.entries(documents).map(([name, docs]) => [name, {
    createIndex: jest.fn(async () => 'index'),
    findOne: jest.fn(async (selector: RecordDoc) => {
      const doc = docs.find((candidate) => matches(candidate, selector))
      return doc ? { ...doc } : null
    }),
    insertOne: jest.fn(async (doc: RecordDoc) => {
      const inserted = { _id: new ObjectId(), ...doc }
      docs.push(inserted)
      return { insertedId: inserted._id }
    }),
    updateOne: jest.fn(async (selector: RecordDoc, mutation: RecordDoc, options?: { upsert?: boolean }) => {
      const doc = docs.find((candidate) => matches(candidate, selector))
      if (doc) update(doc, mutation)
      else if (options?.upsert) {
        const inserted = { _id: new ObjectId(), ...selector }
        update(inserted, mutation)
        docs.push(inserted)
      }
      return { matchedCount: doc ? 1 : 0, modifiedCount: doc ? 1 : 0 }
    }),
    updateMany: jest.fn(async (selector: RecordDoc, mutation: RecordDoc) => {
      const matching = docs.filter((candidate) => matches(candidate, selector))
      matching.forEach((doc) => update(doc, mutation))
      return { matchedCount: matching.length, modifiedCount: matching.length }
    }),
    deleteOne: jest.fn(async (selector: RecordDoc) => {
      const index = docs.findIndex((candidate) => matches(candidate, selector))
      if (index !== -1) docs.splice(index, 1)
      return { deletedCount: index !== -1 ? 1 : 0 }
    }),
    findOneAndDelete: jest.fn(async (selector: RecordDoc) => {
      const index = docs.findIndex((candidate) => matches(candidate, selector))
      return index === -1 ? null : { ...docs.splice(index, 1)[0] }
    })
  }]))
  const db = { collection: jest.fn((name: string) => collections[name]) }
  return { documents, collections, db }
}

describe('authentication security boundaries', () => {
  let app: FastifyInstance
  let store: ReturnType<typeof createStore>
  let user: RecordDoc
  const headers = (token: string) => ({ authorization: `Bearer ${token}` })
  const customLogin = () => app.inject({
    method: 'POST', url: '/custom/login', payload: { apiKey: 'key', options: {} }
  })
  const login = (password = 'old-secret') => app.inject({
    method: 'POST', url: '/local/login', payload: { username: user.email, password }
  })
  const persistRefresh = (token: string, userId = user._id) => {
    store.documents.refresh_tokens.push({
      _id: new ObjectId(), userId, tokenHash: hashToken(token), revokedAt: null,
      createdAt: new Date(), expiresAt: new Date(Date.now() + 86400000)
    })
  }

  beforeEach(async () => {
    jest.clearAllMocks()
    AUTH_CONFIG.localUserpassConfig!.autoConfirm = true
    store = createStore()
    user = {
      _id: new ObjectId(), email: 'owner@example.com', password: await hashPassword('old-secret'),
      status: 'confirmed', sessionVersion: 0, credentialsVersion: 0,
      identities: [{ provider_type: 'local-userpass', provider_id: 'owner@example.com' }]
    }
    store.documents.auth_users.push(user)
    app = fastify()
    app.decorate('mongo', { ObjectId, client: { db: () => store.db } } as never)
    await app.register(jwtAuthPlugin, { secret: 'security-regression-secret' })
    app.get('/protected', { preHandler: app.jwtAuthentication }, async () => ({ ok: true }))
    await app.register(authController, { prefix: '/auth' })
    await app.register(localUserPassController, { prefix: '/local' })
    await app.register(customFunctionController, { prefix: '/custom' })
    registerUserRoutes(app, { prefix: '/monit', addEvent: jest.fn() })
    await app.ready()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await app.close()
  })

  it('rejects existing access tokens immediately when the account is disabled', async () => {
    const token = app.createAccessToken(user)
    user.status = 'disabled'
    expect((await app.inject({ url: '/protected', headers: headers(token) })).statusCode).toBe(401)
  })

  it('rejects a persisted refresh token when the account is disabled', async () => {
    const token = app.createRefreshToken(user)
    persistRefresh(token)
    user.status = 'disabled'
    const response = await app.inject({ method: 'POST', url: '/auth/session', headers: headers(token) })
    expect(response.statusCode).toBe(401)
    expect(response.json().errorCode).toBe('InvalidSession')
  })

  it('rejects local login for a disabled account', async () => {
    user.status = 'disabled'
    expect((await login()).statusCode).toBe(401)
    expect(store.documents.refresh_tokens).toHaveLength(0)
  })

  it('cannot re-enable a disabled account with an outstanding confirmation token', async () => {
    Object.assign(user, { status: 'disabled', confirmationToken: 'token', confirmationTokenId: 'id' })
    const response = await app.inject({
      method: 'POST', url: '/local/confirm', payload: { token: 'token', tokenId: 'id' }
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(user.status).toBe('disabled')
  })

  it('does not re-enable a disabled account when confirmation is resent', async () => {
    user.status = 'disabled'
    const response = await app.inject({
      method: 'POST', url: '/local/confirm/send', payload: { email: user.email }
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(user.status).toBe('disabled')
    expect(GenerateContext).not.toHaveBeenCalled()
  })

  it('does not report confirmation success if the account is disabled before the conditional write', async () => {
    AUTH_CONFIG.localUserpassConfig!.autoConfirm = false
    user.status = 'pending'
    store.collections.auth_users.findOne.mockImplementationOnce(async () => {
      const snapshot = { ...user }
      user.status = 'disabled'
      return snapshot
    })
    const response = await app.inject({
      method: 'POST', url: '/local/confirm/send', payload: { email: user.email }
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(user.status).toBe('disabled')
    expect(GenerateContext).not.toHaveBeenCalled()
  })

  it('does not report success when disable races with the custom confirmation function', async () => {
    AUTH_CONFIG.localUserpassConfig!.autoConfirm = false
    user.status = 'pending'
    ;(GenerateContext as jest.Mock).mockImplementationOnce(async () => {
      user.status = 'disabled'
      return { status: 'success' }
    })
    const response = await app.inject({
      method: 'POST', url: '/local/confirm/send', payload: { email: user.email }
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(user.status).toBe('disabled')
  })

  it('does not report confirmation success when disable races with token consumption', async () => {
    Object.assign(user, { status: 'pending', confirmationToken: 'token', confirmationTokenId: 'id' })
    store.collections.auth_users.findOne.mockImplementationOnce(async () => {
      const snapshot = { ...user }
      user.status = 'disabled'
      return snapshot
    })
    const response = await app.inject({
      method: 'POST', url: '/local/confirm', payload: { token: 'token', tokenId: 'id' }
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(user.status).toBe('disabled')
  })

  it('rejects signed access tokens without a session version', async () => {
    const token = app.createAccessToken({ ...user, sessionVersion: undefined })
    expect((await app.inject({ url: '/protected', headers: headers(token) })).statusCode).toBe(401)
  })

  it('allows access and refresh for an enabled account', async () => {
    const result = await login()
    expect(result.statusCode).toBe(200)
    const { access_token, refresh_token } = result.json()
    expect((await app.inject({ url: '/protected', headers: headers(access_token) })).statusCode).toBe(200)
    const renewed = await app.inject({ method: 'POST', url: '/auth/session', headers: headers(refresh_token) })
    expect(renewed.statusCode).toBe(201)
    expect((await app.inject({ url: '/protected', headers: headers(renewed.json().access_token) })).statusCode).toBe(200)
  })

  it('does not accept a refresh record assigned to a different user', async () => {
    const token = app.createRefreshToken(user)
    persistRefresh(token, new ObjectId())
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(token) })).statusCode).toBe(401)
  })

  it('rejects a persisted refresh token from a revoked credentials version', async () => {
    const token = app.createRefreshToken(user)
    persistRefresh(token)
    user.credentialsVersion += 1
    expect(store.documents.refresh_tokens[0].revokedAt).toBeNull()
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(token) })).statusCode).toBe(401)
  })

  it('rechecks credentials when they change after JWT authentication during refresh', async () => {
    const token = app.createRefreshToken(user)
    persistRefresh(token)
    store.collections.refresh_tokens.findOne.mockImplementationOnce(async () => {
      user.credentialsVersion += 1
      return { ...store.documents.refresh_tokens[0] }
    })
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(token) })).statusCode).toBe(401)
  })

  it('assigns distinct refresh token IDs when sessions are created in the same millisecond', () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now())
    const first = app.createRefreshToken(user)
    const second = app.createRefreshToken(user)
    expect(first).not.toBe(second)
    expect(app.jwt.decode<{ jti: string }>(first)?.jti).not.toBe(app.jwt.decode<{ jti: string }>(second)?.jti)
  })

  it('revokes every stored copy of the current token at logout and accepts a new login in the same millisecond', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.now())
    const refresh = app.createRefreshToken(user)
    const access = app.createAccessToken(user)
    persistRefresh(refresh)
    persistRefresh(refresh)
    const otherRefresh = app.createRefreshToken(user)
    persistRefresh(otherRefresh)
    const logout = await app.inject({ method: 'DELETE', url: '/auth/session', headers: headers(refresh) })
    expect(logout.statusCode).toBe(200)
    expect(store.documents.refresh_tokens.slice(0, 2).every((token) => token.revokedAt instanceof Date)).toBe(true)
    expect(store.documents.refresh_tokens[2].revokedAt).toBeNull()
    expect(user.credentialsVersion).toBe(0)
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(otherRefresh) })).statusCode).toBe(201)
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(refresh) })).statusCode).toBe(401)
    expect((await app.inject({ url: '/protected', headers: headers(access) })).statusCode).toBe(401)
    const next = await login()
    expect(next.statusCode).toBe(200)
    expect((await app.inject({ url: '/protected', headers: headers(next.json().access_token) })).statusCode).toBe(200)
    expect((await app.inject({ method: 'DELETE', url: '/auth/session', headers: headers(refresh) })).statusCode).toBe(200)
    expect(user.sessionVersion).toBe(1)
    expect((await app.inject({ url: '/protected', headers: headers(next.json().access_token) })).statusCode).toBe(200)
  })

  it.each(['custom reset function', 'reset token', 'admin reset'])(
    'revokes all refresh and access tokens after %s', async (flow) => {
      jest.spyOn(Date, 'now').mockReturnValue(Date.now())
      const access = app.createAccessToken(user)
      const refresh = app.createRefreshToken(user)
      persistRefresh(refresh)
      persistRefresh(app.createRefreshToken(user))
      let response
      if (flow === 'custom reset function') {
        ;(GenerateContext as jest.Mock).mockResolvedValue({ status: 'success' })
        response = await app.inject({
          method: 'POST', url: '/local/reset/call', payload: { email: user.email, password: 'new-secret' }
        })
      } else if (flow === 'reset token') {
        store.documents.reset_password_requests.push({
          _id: new ObjectId(), token: 'reset-token', tokenId: 'reset-id', email: user.email, createdAt: new Date()
        })
        response = await app.inject({
          method: 'POST', url: '/local/reset', payload: { token: 'reset-token', tokenId: 'reset-id', password: 'new-secret' }
        })
      } else {
        response = await app.inject({
          method: 'PATCH', url: `/monit/api/users/${user._id}/password`, payload: { password: 'new-secret' }
        })
      }
      expect(response.statusCode).toBeLessThan(300)
      expect(await comparePassword('new-secret', user.password)).toBe(true)
      expect(user.sessionVersion).toBe(1)
      expect(user.credentialsVersion).toBe(1)
      expect(store.documents.refresh_tokens.every((token) => token.revokedAt instanceof Date)).toBe(true)
      expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(refresh) })).statusCode).toBe(401)
      expect((await app.inject({ url: '/protected', headers: headers(access) })).statusCode).toBe(401)
      const next = await login('new-secret')
      expect(next.statusCode).toBe(200)
      expect((await app.inject({ url: '/protected', headers: headers(next.json().access_token) })).statusCode).toBe(200)
    }
  )

  it('invalidates existing credentials even when updating the refresh records fails during reset', async () => {
    const access = app.createAccessToken(user)
    const refresh = app.createRefreshToken(user)
    persistRefresh(refresh)
    store.collections.refresh_tokens.updateMany.mockRejectedValueOnce(new Error('database write failed'))
    const response = await app.inject({
      method: 'PATCH', url: `/monit/api/users/${user._id}/password`, payload: { password: 'new-secret' }
    })
    expect(response.statusCode).toBe(500)
    expect(await comparePassword('new-secret', user.password)).toBe(true)
    expect(user.sessionVersion).toBe(1)
    expect(user.credentialsVersion).toBe(1)
    expect(store.documents.refresh_tokens[0].revokedAt).toBeNull()
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(refresh) })).statusCode).toBe(401)
    expect((await app.inject({ url: '/protected', headers: headers(access) })).statusCode).toBe(401)
    const next = await login('new-secret')
    expect(next.statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(next.json().refresh_token) })).statusCode).toBe(201)
  })

  it('allows only one concurrent password reset to consume the same token', async () => {
    store.documents.reset_password_requests.push({
      _id: new ObjectId(), token: 'single-use', tokenId: 'reset-id', email: user.email, createdAt: new Date()
    })
    const passwords = ['first-secret', 'second-secret']
    const responses = await Promise.all(passwords.map((password) => app.inject({
      method: 'POST', url: '/local/reset', payload: { token: 'single-use', tokenId: 'reset-id', password }
    })))
    const accepted = responses.flatMap((response, index) => response.statusCode < 300 ? [index] : [])
    expect(accepted).toHaveLength(1)
    expect(responses[1 - accepted[0]].statusCode).toBeGreaterThanOrEqual(400)
    expect(await comparePassword(passwords[accepted[0]], user.password)).toBe(true)
    expect(await comparePassword(passwords[1 - accepted[0]], user.password)).toBe(false)
    expect(user.sessionVersion).toBe(1)
    expect(user.credentialsVersion).toBe(1)
    expect(store.documents.reset_password_requests).toHaveLength(0)
    const passwordUpdates = store.collections.auth_users.updateOne.mock.calls.filter(([, mutation]) => mutation.$set?.password)
    expect(passwordUpdates).toHaveLength(1)
  })

  it('does not reset the password again if a reset token is consumed before its custom function returns success', async () => {
    ;(GenerateContext as jest.Mock).mockImplementationOnce(async ({ args }) => {
      const { token, tokenId } = args[0]
      const redeemed = await app.inject({
        method: 'POST', url: '/local/reset', payload: { token, tokenId, password: 'redeemed-secret' }
      })
      expect(redeemed.statusCode).toBe(200)
      return { status: 'success' }
    })
    const response = await app.inject({
      method: 'POST', url: '/local/reset/call', payload: { email: user.email, password: 'second-secret' }
    })
    expect(response.statusCode).toBeGreaterThanOrEqual(400)
    expect(await comparePassword('redeemed-secret', user.password)).toBe(true)
    expect(user.credentialsVersion).toBe(1)
  })

  it('preserves the password reset selector if the account changes after lookup', async () => {
    const email = user.email
    store.collections.auth_users.findOne.mockImplementationOnce(async () => {
      const snapshot = { ...user }
      user.email = 'changed@example.com'
      return snapshot
    })
    const response = await app.inject({
      method: 'PATCH', url: '/monit/api/users/by-email/password', payload: { email, password: 'new-secret' }
    })
    expect(response.statusCode).toBe(404)
    expect(await comparePassword('old-secret', user.password)).toBe(true)
    expect(user.credentialsVersion).toBe(0)
  })

  it('keeps old sessions revoked after disabling and re-enabling the account', async () => {
    const access = app.createAccessToken(user)
    const refresh = app.createRefreshToken(user)
    persistRefresh(refresh)
    expect((await app.inject({
      method: 'PATCH', url: `/monit/api/users/${user._id}/status`, payload: { disabled: true }
    })).statusCode).toBe(200)
    expect((await app.inject({
      method: 'PATCH', url: `/monit/api/users/${user._id}/status`, payload: { disabled: false }
    })).statusCode).toBe(200)
    expect((await app.inject({ url: '/protected', headers: headers(access) })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/auth/session', headers: headers(refresh) })).statusCode).toBe(401)
  })

  it.each([
    { id: 'foreign-id', email: 'owner@example.com' },
    { id: 'owner@example.com' }
  ])('does not link custom identity $id to an existing local account by email', async (identity) => {
    ;(GenerateContext as jest.Mock).mockResolvedValue(identity)
    expect((await customLogin()).statusCode).toBe(401)
    expect(store.documents.auth_users).toHaveLength(1)
    expect(store.documents.refresh_tokens).toHaveLength(0)
  })

  it('rejects a disabled account found through its custom provider identity', async () => {
    user.status = 'disabled'
    user.identities = [{ provider_type: 'custom-function', provider_id: 'custom-id' }]
    ;(GenerateContext as jest.Mock).mockResolvedValue({ id: 'custom-id', email: 'changed@example.com' })
    expect((await customLogin()).statusCode).toBe(401)
    expect(store.documents.refresh_tokens).toHaveLength(0)
  })

  it('matches provider type and ID within the same identity', async () => {
    user.identities = [
      { provider_type: 'custom-function', provider_id: 'another-id' },
      { provider_type: 'local-userpass', provider_id: 'custom-id' }
    ]
    ;(GenerateContext as jest.Mock).mockResolvedValue({ id: 'custom-id', email: user.email })
    expect((await customLogin()).statusCode).toBe(401)
  })

  it('logs in an existing custom identity even when its email metadata changes', async () => {
    user.identities = [{ provider_type: 'custom-function', provider_id: 'custom-id' }]
    ;(GenerateContext as jest.Mock).mockResolvedValue({ id: 'custom-id', email: 'new@example.com' })
    const response = await customLogin()
    expect(response.statusCode).toBe(200)
    expect(response.json().user_id).toBe(user._id.toString())
    expect((await app.inject({ url: '/protected', headers: headers(response.json().access_token) })).statusCode).toBe(200)
    expect(store.documents.auth_users).toHaveLength(1)
  })

  it('creates an independent custom account for a new provider identity', async () => {
    ;(GenerateContext as jest.Mock).mockResolvedValue({ id: 'new-id', email: 'new@example.com' })
    const response = await customLogin()
    expect(response.statusCode).toBe(200)
    expect(response.json().user_id).not.toBe(user._id.toString())
    expect(store.documents.auth_users).toHaveLength(2)
    expect((await app.inject({ url: '/protected', headers: headers(response.json().access_token) })).statusCode).toBe(200)
  })

  it('fails closed when the authentication database is unavailable', async () => {
    const token = app.createAccessToken(user)
    ;(app as any).mongo = undefined
    expect((await app.inject({ url: '/protected', headers: headers(token) })).statusCode).toBe(401)
  })
})
