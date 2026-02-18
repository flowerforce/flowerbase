export type AppConfig = {
  id: string
  baseUrl: string
  timeout?: number
}

export type CredentialsLike =
  | { provider: 'local-userpass'; email: string; password: string }
  | { provider: 'anon-user' }
  | { provider: 'custom-function'; payload: Record<string, unknown> }

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
  insertOne: (document: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
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
  watch: (pipeline?: unknown[], options?: Record<string, unknown>) => WatchAsyncIterator<unknown>
}

export interface MongoDbLike {
  collection: (name: string) => CollectionLike
}

export interface MongoClientLike {
  db: (name: string) => MongoDbLike
}

export interface UserLike {
  id: string
  profile?: {
    email?: string
    [key: string]: unknown
  }
  functions: Record<string, (...args: unknown[]) => Promise<unknown>>
  logOut: () => Promise<void>
  refreshAccessToken: () => Promise<string>
  refreshCustomData: () => Promise<ProfileData>
  mongoClient: (serviceName: string) => MongoClientLike
}
