type StorageSnapshot = Record<string, string | null>

export type PersistedStorage = {
  isPersistent: boolean
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
  hydrate: (keys: string[]) => Promise<StorageSnapshot>
}

const memoryStore = new Map<string, string>()

const getStorage = () => {
  const browserStorage = globalThis.localStorage
  if (
    browserStorage &&
    typeof browserStorage.getItem === 'function' &&
    typeof browserStorage.setItem === 'function' &&
    typeof browserStorage.removeItem === 'function'
  ) {
    return {
      getItem: (key: string) => browserStorage.getItem(key),
      setItem: (key: string, value: string) => browserStorage.setItem(key, value),
      removeItem: (key: string) => browserStorage.removeItem(key)
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

export const createStorage = (): PersistedStorage => {
  const browserStorage = globalThis.localStorage
  const isPersistent =
    !!browserStorage &&
    typeof browserStorage.getItem === 'function' &&
    typeof browserStorage.setItem === 'function' &&
    typeof browserStorage.removeItem === 'function'
  const storage = getStorage()

  return {
    isPersistent,
    getItem: storage.getItem,
    setItem: storage.setItem,
    removeItem: storage.removeItem,
    async hydrate(keys) {
      return Object.fromEntries(keys.map((key) => [key, storage.getItem(key)]))
    }
  }
}
