import { SessionData } from './types'

const memoryStore = new Map<string, string>()

const getStorage = () => {
  if (typeof localStorage !== 'undefined') {
    return {
      getItem: (key: string) => localStorage.getItem(key),
      setItem: (key: string, value: string) => localStorage.setItem(key, value),
      removeItem: (key: string) => localStorage.removeItem(key)
    }
  }

  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value)
    },
    removeItem: (key: string) => {
      memoryStore.delete(key)
    }
  }
}

export class SessionManager {
  private readonly key: string
  private readonly usersKey: string
  private readonly sessionsKey: string
  private readonly storage = getStorage()
  private session: SessionData | null = null

  constructor(appId: string) {
    this.key = `flowerbase:${appId}:session`
    this.usersKey = `flowerbase:${appId}:users`
    this.sessionsKey = `flowerbase:${appId}:sessions`
    this.session = this.load()
  }

  load(): SessionData | null {
    const raw = this.storage.getItem(this.key)
    if (!raw) return null

    try {
      return JSON.parse(raw) as SessionData
    } catch {
      return null
    }
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
    const raw = this.storage.getItem(this.usersKey)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((item): item is string => typeof item === 'string')
    } catch {
      return []
    }
  }

  setUsersOrder(order: string[]) {
    if (order.length === 0) {
      this.storage.removeItem(this.usersKey)
      return
    }
    this.storage.setItem(this.usersKey, JSON.stringify(order))
  }

  getSessionsByUser() {
    const raw = this.storage.getItem(this.sessionsKey)
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

  setSessionsByUser(sessionsByUser: Record<string, SessionData>) {
    if (Object.keys(sessionsByUser).length === 0) {
      this.storage.removeItem(this.sessionsKey)
      return
    }
    this.storage.setItem(this.sessionsKey, JSON.stringify(sessionsByUser))
  }
}
