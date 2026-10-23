import type { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { AUTH_CONFIG, AUTH_DB_NAME } from '../constants'

export type AccessSession = {
  sub: string
  exp: number
  sessionVersion: number
}

export const readAccessSession = (payload: unknown): AccessSession | null => {
  if (!payload || typeof payload !== 'object') return null
  const user = payload as Record<string, unknown>
  if (
    user.typ !== 'access' || typeof user.sub !== 'string' || !ObjectId.isValid(user.sub) ||
    typeof user.exp !== 'number' || !Number.isSafeInteger(user.exp) ||
    typeof user.sessionVersion !== 'number' || !Number.isSafeInteger(user.sessionVersion)
  ) return null

  return { sub: user.sub, exp: user.exp, sessionVersion: user.sessionVersion }
}

export const isAccessSessionActive = async (app: FastifyInstance, session: AccessSession) => {
  if (Date.now() >= session.exp * 1000) return false
  try {
    const user = await app.mongo.client.db(AUTH_DB_NAME)
      .collection(AUTH_CONFIG.authCollection)
      .findOne({ _id: new ObjectId(session.sub) })
    return !!user && user.status !== 'disabled' &&
      user.sessionVersion === session.sessionVersion && Date.now() < session.exp * 1000
  } catch {
    return false
  }
}
