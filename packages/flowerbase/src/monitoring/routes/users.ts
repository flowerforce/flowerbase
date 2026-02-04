import type { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { loadAuthConfig, loadCustomUserData, PASSWORD_RULES } from '../../auth/utils'
import { AUTH_CONFIG, DB_NAME } from '../../constants'
import handleUserRegistration from '../../shared/handleUserRegistration'
import { PROVIDER } from '../../shared/models/handleUserRegistration.model'
import { hashPassword } from '../../utils/crypto'
import { createEventId, MonitorEvent, sanitize } from '../utils'

export type UserRoutesDeps = {
  prefix: string
  addEvent: (event: MonitorEvent) => void
}

const validatePassword = (password: string) => {
  if (password.length < PASSWORD_RULES.minLength) {
    return `Password must be at least ${PASSWORD_RULES.minLength} characters`
  }
  if (password.length > PASSWORD_RULES.maxLength) {
    return `Password must be at most ${PASSWORD_RULES.maxLength} characters`
  }
  return ''
}

export const registerUserRoutes = (app: FastifyInstance, deps: UserRoutesDeps) => {
  const { prefix, addEvent } = deps

  app.get(`${prefix}/api/users`, async (req) => {
    const query = req.query as {
      scope?: string
      limit?: string
      authLimit?: string
      customLimit?: string
      customPage?: string
      page?: string
      q?: string
    }
    const scope = query.scope ?? 'all'
    const rawSearch = typeof query.q === 'string' ? query.q.trim() : ''
    const hasSearch = rawSearch.length > 0
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')
    const searchRegex = hasSearch ? new RegExp(escapeRegex(rawSearch), 'i') : null
    const searchObjectId = hasSearch && ObjectId.isValid(rawSearch) ? new ObjectId(rawSearch) : null
    const parsedAuthLimit = Number(query.authLimit ?? query.limit ?? 100)
    const parsedCustomLimit = Number(query.customLimit ?? query.limit ?? 25)
    const parsedPage = Number(query.customPage ?? query.page ?? 1)
    const resolvedAuthLimit = Math.min(Number.isFinite(parsedAuthLimit) && parsedAuthLimit > 0 ? parsedAuthLimit : 100, 500)
    const resolvedCustomLimit = Math.min(Number.isFinite(parsedCustomLimit) && parsedCustomLimit > 0 ? parsedCustomLimit : 25, 500)
    const resolvedCustomPage = Math.max(Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1, 1)
    const db = app.mongo.client.db(DB_NAME)
    const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
    const userCollection = AUTH_CONFIG.userCollection

    const response: Record<string, unknown> = {
      meta: {
        userIdField: AUTH_CONFIG.user_id_field,
        authCollection,
        customCollection: userCollection
      }
    }

    if (scope === 'all' || scope === 'auth') {
      const authFilter = hasSearch
        ? {
          $or: [
            ...(searchObjectId ? [{ _id: searchObjectId }] : []),
            { email: searchRegex },
            { status: searchRegex }
          ]
        }
        : {}
      const authItems = await db
        .collection(authCollection)
        .find(authFilter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(resolvedAuthLimit)
        .toArray()
      response.auth = {
        collection: authCollection,
        items: authItems.map((doc) => sanitize(doc))
      }
    }

    if ((scope === 'all' || scope === 'custom') && userCollection) {
      const userIdField = AUTH_CONFIG.user_id_field ?? 'id'
      const customFilter = hasSearch
        ? {
          $or: [
            ...(searchObjectId ? [{ _id: searchObjectId }] : []),
            { [userIdField]: searchRegex },
            { email: searchRegex },
            { name: searchRegex },
            { username: searchRegex }
          ]
        }
        : {}
      const total = await db.collection(userCollection).countDocuments(customFilter)
      const totalPages = Math.max(1, Math.ceil(total / Math.max(resolvedCustomLimit, 1)))
      const page = Math.min(resolvedCustomPage, totalPages)
      const skip = Math.max(0, (page - 1) * resolvedCustomLimit)
      const customItems = await db
        .collection(userCollection)
        .find(customFilter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(resolvedCustomLimit)
        .toArray()
      response.custom = {
        collection: userCollection,
        items: customItems.map((doc) => sanitize(doc)),
        pagination: {
          page,
          pages: totalPages,
          total,
          pageSize: resolvedCustomLimit
        }
      }
    }

    return response
  })

  app.get(`${prefix}/api/users/config`, async () => {
    return {
      providers: loadAuthConfig(),
      customUserData: loadCustomUserData(),
      passwordRules: PASSWORD_RULES
    }
  })

  app.post(`${prefix}/api/users`, async (req, reply) => {
    const body = req.body as { email?: string; password?: string; customData?: Record<string, unknown> }
    const email = body?.email?.toLowerCase()
    const password = body?.password
    if (!email || !password) {
      reply.code(400)
      return { error: 'Missing email or password' }
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      reply.code(400)
      return { error: passwordError }
    }

    const result = await handleUserRegistration(app, {
      run_as_system: true,
      provider: PROVIDER.LOCAL_USERPASS
    })({ email, password })

    const userId = result?.insertedId?.toString()

    if (userId && AUTH_CONFIG.userCollection && AUTH_CONFIG.user_id_field) {
      const db = app.mongo.client.db(DB_NAME)
      const customData = body?.customData ?? {}
      await db.collection(AUTH_CONFIG.userCollection).updateOne(
        { [AUTH_CONFIG.user_id_field]: userId },
        {
          $set: {
            ...customData,
            [AUTH_CONFIG.user_id_field]: userId
          }
        },
        { upsert: true }
      )
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'auth',
      source: 'monit',
      message: 'user created',
      data: sanitize({ email, userId })
    })

    reply.code(201)
    return { userId }
  })

  app.patch(`${prefix}/api/users/:id/password`, async (req, reply) => {
    const params = req.params as { id: string }
    const body = req.body as { password?: string; email?: string }
    const password = body?.password
    if (!password) {
      reply.code(400)
      return { error: 'Missing password' }
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      reply.code(400)
      return { error: passwordError }
    }

    const db = app.mongo.client.db(DB_NAME)
    const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
    const selector: Record<string, unknown> = {}

    if (params.id && ObjectId.isValid(params.id)) {
      selector._id = new ObjectId(params.id)
    } else if (body?.email) {
      selector.email = body.email.toLowerCase()
    } else {
      reply.code(400)
      return { error: 'Invalid user identifier' }
    }

    const hashedPassword = await hashPassword(password)
    const result = await db.collection(authCollection).updateOne(selector, {
      $set: { password: hashedPassword }
    })

    if (!result.matchedCount) {
      reply.code(404)
      return { error: 'User not found' }
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'auth',
      source: 'monit',
      message: 'password updated',
      data: sanitize({ selector })
    })

    return { status: 'ok' }
  })

  app.patch(`${prefix}/api/users/:id/status`, async (req, reply) => {
    const params = req.params as { id: string }
    const body = req.body as { disabled?: boolean; status?: string; email?: string }
    const db = app.mongo.client.db(DB_NAME)
    const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
    const selector: Record<string, unknown> = {}

    if (params.id && ObjectId.isValid(params.id)) {
      selector._id = new ObjectId(params.id)
    } else if (body?.email) {
      selector.email = body.email.toLowerCase()
    } else {
      reply.code(400)
      return { error: 'Invalid user identifier' }
    }

    const status = typeof body?.disabled === 'boolean'
      ? (body.disabled ? 'disabled' : 'confirmed')
      : (body?.status ?? 'disabled')

    const result = await db.collection(authCollection).updateOne(selector, {
      $set: { status }
    })

    if (!result.matchedCount) {
      reply.code(404)
      return { error: 'User not found' }
    }

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'auth',
      source: 'monit',
      message: `user status ${status}`,
      data: sanitize({ selector, status })
    })

    return { status: 'ok' }
  })
}
