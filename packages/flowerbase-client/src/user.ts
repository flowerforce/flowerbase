import type { App } from './app'
import { createFunctionsProxy } from './functions'
import { createMongoClient } from './mongo'
import { MongoClientLike, UserLike } from './types'

export class User implements UserLike {
  readonly id: string
  profile?: { email?: string;[key: string]: unknown }
  private readonly app: App
  private _providerType: string | null = null
  private readonly listeners = new Set<() => void>()

  functions: Record<string, (...args: unknown[]) => Promise<unknown>> & {
    callFunction: (name: string, ...args: unknown[]) => Promise<unknown>
    callFunctionStreaming: (name: string, ...args: unknown[]) => Promise<AsyncIterable<Uint8Array>>
  }

  constructor(app: App, id: string) {
    this.app = app
    this.id = id
    this.functions = createFunctionsProxy(
      (name, args) => this.app.callFunction(name, args, this.id),
      (name, args) => this.app.callFunctionStreaming(name, args, this.id)
    )
  }

  get state() {
    if (!this.app.hasUser(this.id)) {
      return 'removed'
    }
    return this.isLoggedIn ? 'active' : 'logged-out'
  }

  get isLoggedIn() {
    return this.accessToken !== null && this.refreshToken !== null
  }

  get providerType() {
    return this._providerType
  }

  get identities() {
    return this.app.getProfileSnapshot(this.id)?.identities ?? []
  }

  get customData() {
    const payload = this.decodeAccessTokenPayload()
    if (!payload) return {}
    const fromUserData =
      'user_data' in payload && payload.user_data && typeof payload.user_data === 'object'
        ? (payload.user_data as Record<string, unknown>)
        : 'userData' in payload && payload.userData && typeof payload.userData === 'object'
          ? (payload.userData as Record<string, unknown>)
          : 'custom_data' in payload && payload.custom_data && typeof payload.custom_data === 'object'
            ? (payload.custom_data as Record<string, unknown>)
            : {}
    return fromUserData
  }

  get accessToken() {
    const session = this.app.getSession(this.id)
    if (!session) return null
    return session.accessToken
  }

  get refreshToken() {
    const session = this.app.getSession(this.id)
    if (!session) return null
    return session.refreshToken
  }

  setProviderType(providerType: string) {
    this._providerType = providerType
  }

  private decodeAccessTokenPayload() {
    if (!this.accessToken) return null
    const parts = this.accessToken.split('.')
    if (parts.length < 2) return null

    const base64Url = parts[1]
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=')

    const decodeBase64 = (input: string) => {
      if (typeof atob === 'function') return atob(input)
      const runtimeBuffer = (globalThis as { Buffer?: { from: (data: string, encoding: string) => { toString: (enc: string) => string } } }).Buffer
      if (runtimeBuffer) return runtimeBuffer.from(input, 'base64').toString('utf8')
      return ''
    }

    try {
      const decoded = decodeBase64(base64)
      return JSON.parse(decoded) as Record<string, unknown>
    } catch {
      return null
    }
  }

  async logOut() {
    await this.app.logoutUser(this.id)
  }

  async callFunction(name: string, ...args: unknown[]) {
    return this.app.callFunction(name, args, this.id)
  }

  async refreshAccessToken() {
    return this.app.refreshAccessToken(this.id)
  }

  async refreshCustomData(): Promise<Record<string, unknown>> {
    const profile = await this.app.getProfile(this.id)
    this.profile = profile.data
    this.notifyListeners()
    return profile.custom_data || {}
  }

  mongoClient(serviceName: string): MongoClientLike {
    return createMongoClient(this.app, serviceName, this.id)
  }

  addListener(callback: () => void) {
    this.listeners.add(callback)
  }

  removeListener(callback: () => void) {
    this.listeners.delete(callback)
  }

  removeAllListeners() {
    this.listeners.clear()
  }

  notifyListeners() {
    for (const callback of Array.from(this.listeners)) {
      try {
        callback()
      } catch {
        // Listener failures should not break user lifecycle operations.
      }
    }
  }
}
