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
  private readonly storage = getStorage()
  private session: SessionData | null = null

  constructor(appId: string) {
    this.key = `flowerbase:${appId}:session`
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
}
