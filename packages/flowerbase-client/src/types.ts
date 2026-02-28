export type AppConfig = {
  id: string
  baseUrl?: string
  timeout?: number
}

export type CredentialsLike =
  | { provider: 'local-userpass'; email: string; password: string }
  | { provider: 'anon-user' }
  | { provider: 'custom-function'; payload: Record<string, unknown> }
  | { provider: 'custom-token'; token: string }

export type SessionData = {
  accessToken: string
  refreshToken: string
  userId: string
}

export type ProfileData = {
  _id?: string
  identities?: unknown[]
  type?: string
  custom_data?: Record<string, unknown>
  data?: Record<string, unknown>
}

export type FunctionCallPayload = {
  name: string
  arguments: unknown[]
  service?: string
}

export type WatchConfig = {
  appId: string
  baseUrl: string
  accessToken: string
  database: string
  collection: string
  pipeline?: unknown[]
  options?: Record<string, unknown>
  timeout?: number
}

export type WatchAsyncIterator<TChange = unknown> = AsyncIterableIterator<TChange> & {
  close: () => void
}

export interface CollectionLike {
  find: (query?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  findOne: (query?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  findOneAndUpdate: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>
  findOneAndReplace: (
    filter: Record<string, unknown>,
    replacement: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>
  findOneAndDelete: (filter: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  aggregate: (pipeline: Record<string, unknown>[]) => Promise<unknown>
  count: (filter?: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  insertOne: (document: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  insertMany: (documents: Record<string, unknown>[], options?: Record<string, unknown>) => Promise<unknown>
  updateOne: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>
  updateMany: (
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<unknown>
  deleteOne: (filter: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  deleteMany: (filter: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  watch: (options?: unknown) => WatchAsyncIterator<unknown>
}

export interface MongoDbLike {
  collection: (name: string) => CollectionLike
}

export interface MongoClientLike {
  db: (name: string) => MongoDbLike
}

export interface UserLike {
  id: string
  state: 'active' | 'logged-out' | 'removed'
  isLoggedIn: boolean
  accessToken: string | null
  refreshToken: string | null
  providerType: string | null
  identities: unknown[]
  customData: Record<string, unknown>
  profile?: {
    email?: string
    [key: string]: unknown
  }
  functions: Record<string, (...args: unknown[]) => Promise<unknown>> & {
    callFunction: (name: string, ...args: unknown[]) => Promise<unknown>
    callFunctionStreaming: (name: string, ...args: unknown[]) => Promise<AsyncIterable<Uint8Array>>
  }
  logOut: () => Promise<void>
  callFunction: (name: string, ...args: unknown[]) => Promise<unknown>
  refreshAccessToken: () => Promise<string>
  refreshCustomData: () => Promise<Record<string, unknown>>
  mongoClient: (serviceName: string) => MongoClientLike
  addListener: (callback: () => void) => void
  removeListener: (callback: () => void) => void
  removeAllListeners: () => void
}
