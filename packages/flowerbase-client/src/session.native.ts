import { SessionData } from './types'

type StorageLike = {
  getItem: (key: string) => Promise<string | null>
  setItem: (key: string, value: string) => Promise<void>
  removeItem: (key: string) => Promise<void>
}

const memoryStore = new Map<string, string>()

const getAsyncStorage = (): StorageLike | null => {
  try {
    const req = (0, eval)('require') as (name: string) => unknown
    const asyncStorageModule = req('@react-native-async-storage/async-storage') as {
      default?: StorageLike
    }
    return asyncStorageModule?.default ?? null
  } catch {
    return null
  }
}

const parseSession = (raw: string | null): SessionData | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionData
  } catch {
    return null
  }
}

export class SessionManager {
  private readonly key: string
  private session: SessionData | null = null
  private readonly asyncStorage = getAsyncStorage()
  private hydrationPromise: Promise<void> | null = null

  constructor(appId: string) {
    this.key = `flowerbase:${appId}:session`
    this.session = this.load()
    void this.hydrateFromAsyncStorage()
  }

  private hydrateFromAsyncStorage() {
    if (!this.asyncStorage) {
      return Promise.resolve()
    }

    if (this.hydrationPromise) {
      return this.hydrationPromise
    }

    this.hydrationPromise = this.asyncStorage
      .getItem(this.key)
      .then((raw) => {
        const parsed = parseSession(raw)
        if (!parsed) return
        this.session = parsed
        memoryStore.set(this.key, JSON.stringify(parsed))
      })
      .catch(() => {
        // Ignore storage read failures and keep memory fallback.
      })

    return this.hydrationPromise
  }

  load(): SessionData | null {
    return parseSession(memoryStore.get(this.key) ?? null)
  }

  get() {
    return this.session
  }

  set(session: SessionData) {
    this.session = session
    const raw = JSON.stringify(session)
    memoryStore.set(this.key, raw)

    if (this.asyncStorage) {
      void this.asyncStorage.setItem(this.key, raw).catch(() => {
        // Ignore write failures and keep memory fallback.
      })
    }
  }

  clear() {
    this.session = null
    memoryStore.delete(this.key)

    if (this.asyncStorage) {
      void this.asyncStorage.removeItem(this.key).catch(() => {
        // Ignore delete failures and keep memory fallback.
      })
    }
  }
}
