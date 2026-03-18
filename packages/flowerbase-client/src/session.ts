import { SessionData } from './types'
import { createStorage } from './storage'

const parseSession = (raw: string | null): SessionData | null => {
  if (!raw) return null

  try {
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}

const parseUsersOrder = (raw: string | null) => {
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

const parseSessionsByUser = (raw: string | null) => {
  if (!raw) return {} as Record<string, SessionData>

  try {
    const parsed = JSON.parse(raw) as Record<string, SessionData>
    const normalized: Record<string, SessionData> = {}
    for (const [userId, session] of Object.entries(parsed)) {
      if (
        session &&
        typeof session === 'object' &&
        typeof session.accessToken === 'string' &&
        typeof session.refreshToken === 'string' &&
        typeof session.userId === 'string'
      ) {
        normalized[userId] = session
      }
    }
    return normalized
  } catch {
    return {} as Record<string, SessionData>
  }
}

export class SessionManager {
  private readonly key: string
  private readonly usersKey: string
  private readonly sessionsKey: string
  private readonly storage = createStorage()
  private readonly hydrationPromise: Promise<void>
  private session: SessionData | null = null
  private usersOrder: string[] = []
  private sessionsByUser: Record<string, SessionData> = {}

  constructor(appId: string) {
    this.key = `flowerbase:${appId}:session`
    this.usersKey = `flowerbase:${appId}:users`
    this.sessionsKey = `flowerbase:${appId}:sessions`
    this.session = parseSession(this.storage.getItem(this.key))
    this.usersOrder = parseUsersOrder(this.storage.getItem(this.usersKey))
    this.sessionsByUser = parseSessionsByUser(this.storage.getItem(this.sessionsKey))
    this.hydrationPromise = this.hydrate()
  }

  private async hydrate() {
    const hydrated = await this.storage.hydrate([this.key, this.usersKey, this.sessionsKey])
    this.session = parseSession(hydrated[this.key] ?? null)
    this.usersOrder = parseUsersOrder(hydrated[this.usersKey] ?? null)
    this.sessionsByUser = parseSessionsByUser(hydrated[this.sessionsKey] ?? null)
  }

  whenReady() {
    return this.hydrationPromise
  }

  hasPersistentStorage() {
    return this.storage.isPersistent
  }

  get() {
    return this.session
  }

  set(session: SessionData) {
    this.session = session
    this.storage.setItem(this.key, JSON.stringify(session))
  }

  clear() {
    this.session = null
    this.storage.removeItem(this.key)
  }

  getUsersOrder() {
    return [...this.usersOrder]
  }

  setUsersOrder(order: string[]) {
    this.usersOrder = [...order]
    if (order.length === 0) {
      this.storage.removeItem(this.usersKey)
      return
    }
    this.storage.setItem(this.usersKey, JSON.stringify(order))
  }

  getSessionsByUser() {
    return { ...this.sessionsByUser }
  }

  setSessionsByUser(sessionsByUser: Record<string, SessionData>) {
    this.sessionsByUser = { ...sessionsByUser }
    if (Object.keys(sessionsByUser).length === 0) {
      this.storage.removeItem(this.sessionsKey)
      return
    }
    this.storage.setItem(this.sessionsKey, JSON.stringify(sessionsByUser))
  }
}
