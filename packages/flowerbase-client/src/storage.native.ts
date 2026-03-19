import AsyncStorage from '@react-native-async-storage/async-storage'

type StorageSnapshot = Record<string, string | null>

export type PersistedStorage = {
  isPersistent: boolean
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  hydrate: (keys: string[]) => Promise<StorageSnapshot>
}

const memoryStore = new Map<string, string>()

const getSnapshot = (keys: string[]): StorageSnapshot =>
  Object.fromEntries(keys.map((key) => [key, memoryStore.get(key) ?? null]))

export const createStorage = (): PersistedStorage => ({
  isPersistent: true,
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, value) => {
    memoryStore.set(key, value)
    void AsyncStorage.setItem(key, value).catch(() => {
      // Ignore write failures and keep the in-memory cache alive.
    })
  },
  removeItem: (key) => {
    memoryStore.delete(key)
    void AsyncStorage.removeItem(key).catch(() => {
      // Ignore delete failures and keep the in-memory cache alive.
    })
  },
  async hydrate(keys) {
    try {
      const entries = await AsyncStorage.multiGet(keys)
      for (const [key, value] of entries) {
        if (value === null) {
          memoryStore.delete(key)
          continue
        }
        memoryStore.set(key, value)
      }
    } catch {
      // Ignore storage read failures and keep the in-memory cache alive.
    }

    return getSnapshot(keys)
  }
})
