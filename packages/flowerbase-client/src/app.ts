import { normalizeFunctionResponse } from './functions'
import { FlowerbaseHttpError, requestJson, requestStream } from './http'
import { SessionManager } from './session'
import { AppConfig, CredentialsLike, FunctionCallPayload, ProfileData, SessionData } from './types'
import { Credentials } from './credentials'
import { User } from './user'

const API_PREFIX = '/api/client/v2.0'

type LoginResponse = {
  access_token: string
  refresh_token: string
  user_id: string
}

type SessionResponse = {
  access_token: string
}

export class App {
  private static readonly appCache: Record<string, App> = {}
  static readonly Credentials = Credentials

  readonly id: string
  readonly baseUrl: string
  readonly timeout: number
  private readonly sessionManager: SessionManager
  private readonly usersById = new Map<string, User>()
  private readonly sessionsByUserId = new Map<string, SessionData>()
  private usersOrder: string[] = []
  private readonly profilesByUserId = new Map<string, ProfileData>()
  private readonly sessionBootstrapPromise: Promise<void>
  private readonly listeners = new Set<() => void>()

  emailPasswordAuth: {
    registerUser: (input: { email: string; password: string }) => Promise<unknown>
    confirmUser: (input: { token: string; tokenId: string }) => Promise<unknown>
    resendConfirmationEmail: (input: { email: string }) => Promise<unknown>
    retryCustomConfirmation: (input: { email: string }) => Promise<unknown>
    sendResetPasswordEmail: (input: { email: string } | string) => Promise<unknown>
    callResetPasswordFunction: (
      input: { email: string; password: string } | string,
      passwordOrArg?: string,
      ...args: unknown[]
    ) => Promise<unknown>
    resetPassword: (input: { token: string; tokenId: string; password: string }) => Promise<unknown>
  }

  constructor(idOrConfig: string | AppConfig) {
    const config = typeof idOrConfig === 'string' ? { id: idOrConfig } : idOrConfig
    this.id = config.id
    this.baseUrl = (config.baseUrl ?? '').replace(/\/$/, '')
    this.timeout = config.timeout ?? 10000
    this.sessionManager = new SessionManager(this.id)
    const persistedSessionsByUser = this.sessionManager.getSessionsByUser()
    for (const [userId, session] of Object.entries(persistedSessionsByUser)) {
      this.sessionsByUserId.set(userId, session)
    }
    this.usersOrder = this.sessionManager.getUsersOrder()
    for (const userId of this.sessionsByUserId.keys()) {
      if (!this.usersOrder.includes(userId)) {
        this.usersOrder.push(userId)
      }
    }
    for (const userId of this.usersOrder) {
      this.getOrCreateUser(userId)
    }

    const currentSession = this.sessionManager.get()
    if (currentSession?.userId) {
      this.sessionsByUserId.set(currentSession.userId, currentSession)
      this.getOrCreateUser(currentSession.userId)
      this.touchUser(currentSession.userId)
      this.persistSessionsByUser()
    } else {
      this.setCurrentSessionFromOrder()
    }
    this.sessionBootstrapPromise = this.bootstrapSessionOnLoad()

    this.emailPasswordAuth = {
      registerUser: ({ email, password }) =>
        this.postProvider('/local-userpass/register', { email, password }),
      confirmUser: ({ token, tokenId }) =>
        this.postProvider('/local-userpass/confirm', { token, tokenId }),
      resendConfirmationEmail: ({ email }) =>
        this.postProvider('/local-userpass/confirm/send', { email }),
      retryCustomConfirmation: ({ email }) =>
        this.postProvider('/local-userpass/confirm/call', { email }),
      sendResetPasswordEmail: (input) =>
        this.postProvider('/local-userpass/reset/send', {
          email: typeof input === 'string' ? input : input.email
        }),
      callResetPasswordFunction: (input, passwordOrArg, ...args) => {
        if (typeof input === 'string') {
          return this.postProvider('/local-userpass/reset/call', {
            email: input,
            password: passwordOrArg,
            arguments: args
          })
        }

        return this.postProvider('/local-userpass/reset/call', {
          email: input.email,
          password: input.password,
          arguments: [passwordOrArg, ...args].filter((value) => value !== undefined)
        })
      },
      resetPassword: ({ token, tokenId, password }) =>
        this.postProvider('/local-userpass/reset', { token, tokenId, password })
    }
  }

  static getApp(appIdOrConfig: string | AppConfig) {
    const appId = typeof appIdOrConfig === 'string' ? appIdOrConfig : appIdOrConfig.id
    if (appId in App.appCache) {
      return App.appCache[appId]
    }
    const app = new App(appIdOrConfig)
    App.appCache[appId] = app
    return app
  }

  get currentUser() {
    for (const userId of this.usersOrder) {
      const user = this.usersById.get(userId)
      if (user?.state === 'active') {
        return user
      }
    }
    return null
  }

  get allUsers(): Readonly<Record<string, User>> {
    const activeUsers: string[] = []
    const loggedOutUsers: string[] = []
    for (const userId of this.usersOrder) {
      const user = this.usersById.get(userId)
      if (!user) continue
      if (user.state === 'active') {
        activeUsers.push(userId)
      } else if (user.state === 'logged-out') {
        loggedOutUsers.push(userId)
      }
    }

    const users = Object.fromEntries(
      [...activeUsers, ...loggedOutUsers].map((userId) => [userId, this.usersById.get(userId)!])
    )
    return users
  }

  private persistSessionsByUser() {
    this.sessionManager.setSessionsByUser(Object.fromEntries(this.sessionsByUserId.entries()))
  }

  private persistUsersOrder() {
    this.sessionManager.setUsersOrder(this.usersOrder)
  }

  private touchUser(userId: string) {
    this.usersOrder = [userId, ...this.usersOrder.filter((id) => id !== userId)]
    this.persistUsersOrder()
  }

  private removeUserFromOrder(userId: string) {
    this.usersOrder = this.usersOrder.filter((id) => id !== userId)
    this.persistUsersOrder()
  }

  private setSessionForUser(session: SessionData) {
    this.sessionsByUserId.set(session.userId, session)
    this.sessionManager.set(session)
    this.persistSessionsByUser()
  }

  private clearSessionForUser(userId: string) {
    this.sessionsByUserId.delete(userId)
    this.persistSessionsByUser()
  }

  private setCurrentSessionFromOrder() {
    for (const userId of this.usersOrder) {
      const session = this.sessionsByUserId.get(userId)
      if (session) {
        this.sessionManager.set(session)
        return
      }
    }
    this.sessionManager.clear()
  }

  private notifyListeners(userId?: string) {
    for (const callback of Array.from(this.listeners)) {
      try {
        callback()
      } catch {
        // Listener failures should not break auth/session lifecycle.
      }
    }

    if (userId) {
      this.usersById.get(userId)?.notifyListeners()
    }
  }

  private providerUrl(path: string) {
    return `${this.baseUrl}${API_PREFIX}/app/${this.id}/auth/providers${path}`
  }

  private authUrl(path: string) {
    return `${this.baseUrl}${API_PREFIX}/auth${path}`
  }

  private functionsUrl(path = '/call') {
    return `${this.baseUrl}${API_PREFIX}/app/${this.id}/functions${path}`
  }

  private async createSession(refreshToken: string): Promise<SessionResponse> {
    return requestJson<SessionResponse>({
      url: this.authUrl('/session'),
      method: 'POST',
      bearerToken: refreshToken,
      timeout: this.timeout
    })
  }

  private async bootstrapSessionOnLoad(): Promise<void> {
    const session = this.sessionManager.get()
    if (!session || typeof localStorage === 'undefined') {
      return
    }

    try {
      const result = await this.createSession(session.refreshToken)
      this.setSessionForUser({
        ...session,
        accessToken: result.access_token
      })
    } catch {
      this.clearSessionForUser(session.userId)
      this.setCurrentSessionFromOrder()
    }
  }

  private async ensureSessionBootstrapped() {
    await this.sessionBootstrapPromise
  }

  private async setLoggedInUser(
    data: LoginResponse,
    providerType: CredentialsLike['provider'],
    profileEmail?: string
  ) {
    const sessionResult = await this.createSession(data.refresh_token)
    const session: SessionData = {
      accessToken: sessionResult.access_token,
      refreshToken: data.refresh_token,
      userId: data.user_id
    }
    this.setSessionForUser(session)
    const user = this.getOrCreateUser(data.user_id)
    user.setProviderType(providerType)
    this.touchUser(data.user_id)
    if (profileEmail) {
      user.profile = { email: profileEmail }
    }
    this.notifyListeners(data.user_id)
    return user
  }

  private getOrCreateUser(userId: string) {
    const existing = this.usersById.get(userId)
    if (existing) {
      return existing
    }
    const user = new User(this, userId)
    this.usersById.set(userId, user)
    return user
  }

  async logIn(credentials: CredentialsLike) {
    if (credentials.provider === 'local-userpass') {
      const result = await this.postProvider<LoginResponse>('/local-userpass/login', {
        username: credentials.email,
        password: credentials.password
      })
      return this.setLoggedInUser(result, 'local-userpass', credentials.email)
    }

    if (credentials.provider === 'anon-user') {
      const result = await this.postProvider<LoginResponse>('/anon-user/login', {})
      return this.setLoggedInUser(result, 'anon-user')
    }

    if (credentials.provider === 'custom-function') {
      const result = await this.postProvider<LoginResponse>('/custom-function/login', credentials.payload)
      return this.setLoggedInUser(result, 'custom-function')
    }

    if (credentials.provider === 'custom-token') {
      const result = await this.postProvider<LoginResponse>('/custom-token/login', { token: credentials.token })
      return this.setLoggedInUser(result, 'custom-token')
    }

    const unsupportedProvider: never = credentials
    throw new Error(`Unsupported credentials provider: ${JSON.stringify(unsupportedProvider)}`)
  }

  switchUser(nextUser: User) {
    const knownUser = this.usersById.get(nextUser.id)
    if (!knownUser) {
      throw new Error('The user was never logged into this app')
    }
    this.touchUser(nextUser.id)
    const session = this.sessionsByUserId.get(nextUser.id)
    if (session) {
      this.sessionManager.set(session)
    }
    this.notifyListeners(nextUser.id)
  }

  async removeUser(user: User) {
    const knownUser = this.usersById.get(user.id)
    if (!knownUser) {
      throw new Error('The user was never logged into this app')
    }
    if (this.sessionsByUserId.has(user.id)) {
      await this.logoutUser(user.id)
    }
    this.usersById.delete(user.id)
    this.removeUserFromOrder(user.id)
    this.profilesByUserId.delete(user.id)
    this.clearSessionForUser(user.id)
    this.setCurrentSessionFromOrder()
    this.notifyListeners(user.id)
  }

  async deleteUser(user: User) {
    await this.requestWithAccessToken((accessToken) =>
      requestJson({
        url: this.authUrl('/delete'),
        method: 'DELETE',
        bearerToken: accessToken,
        timeout: this.timeout
      }),
      user.id
    )
    await this.removeUser(user)
  }

  getSessionOrThrow(userId?: string) {
    const targetUserId = userId ?? this.currentUser?.id
    const session = targetUserId ? this.sessionsByUserId.get(targetUserId) : this.sessionManager.get()
    if (!session) {
      throw new Error('User is not authenticated')
    }
    return session
  }

  getSession(userId?: string) {
    if (userId) {
      return this.sessionsByUserId.get(userId) ?? null
    }
    return this.sessionManager.get()
  }

  hasUser(userId: string) {
    return this.usersById.has(userId)
  }

  getProfileSnapshot(userId: string) {
    return this.profilesByUserId.get(userId)
  }

  async postProvider<T = unknown>(path: string, body: unknown): Promise<T> {
    return requestJson<T>({
      url: this.providerUrl(path),
      method: 'POST',
      body,
      timeout: this.timeout
    })
  }

  private async requestWithAccessToken<T>(operation: (accessToken: string) => Promise<T>, userId?: string) {
    const firstSession = this.getSessionOrThrow(userId)
    try {
      return await operation(firstSession.accessToken)
    } catch (error) {
      if (!(error instanceof FlowerbaseHttpError) || error.status !== 401) {
        throw error
      }
      await this.refreshAccessToken(userId)
      const refreshedSession = this.getSessionOrThrow(userId)
      return operation(refreshedSession.accessToken)
    }
  }

  async callFunction(name: string, args: unknown[], userId?: string) {
    await this.ensureSessionBootstrapped()
    const payload: FunctionCallPayload = {
      name,
      arguments: args
    }

    const result = await this.requestWithAccessToken((accessToken) =>
      requestJson<unknown>({
        url: this.functionsUrl('/call'),
        method: 'POST',
        body: payload,
        bearerToken: accessToken,
        timeout: this.timeout
      }),
      userId
    )

    return normalizeFunctionResponse(result)
  }

  async callFunctionStreaming(name: string, args: unknown[], userId?: string): Promise<AsyncIterable<Uint8Array>> {
    await this.ensureSessionBootstrapped()
    const payload: FunctionCallPayload = {
      name,
      arguments: args
    }
    const resolveSession = () => this.getSessionOrThrow(userId)
    const refreshSession = () => this.refreshAccessToken(userId)
    const timeout = this.timeout
    const url = this.functionsUrl('/call')

    return {
      async *[Symbol.asyncIterator]() {
        let didRefresh = false
        while (true) {
          const session = resolveSession()
          let stream: AsyncIterable<Uint8Array>

          try {
            stream = await requestStream({
              url,
              method: 'POST',
              body: payload,
              bearerToken: session.accessToken,
              timeout
            })
          } catch (error) {
            if (!didRefresh && error instanceof FlowerbaseHttpError && error.status === 401) {
              await refreshSession()
              didRefresh = true
              continue
            }
            throw error
          }

          try {
            for await (const chunk of stream) {
              yield chunk
            }
            return
          } catch (error) {
            if (!didRefresh && error instanceof FlowerbaseHttpError && error.status === 401) {
              await refreshSession()
              didRefresh = true
              continue
            }
            throw error
          }
        }
      }
    }
  }

  async callService(name: string, args: unknown[], service = 'mongodb-atlas', userId?: string) {
    await this.ensureSessionBootstrapped()
    const payload: FunctionCallPayload = {
      name,
      service,
      arguments: args
    }

    return this.requestWithAccessToken((accessToken) =>
      requestJson<unknown>({
        url: this.functionsUrl('/call'),
        method: 'POST',
        body: payload,
        bearerToken: accessToken,
        timeout: this.timeout
      }),
      userId
    )
  }

  async getProfile(userId?: string): Promise<ProfileData> {
    await this.ensureSessionBootstrapped()
    const profile = await this.requestWithAccessToken((accessToken) =>
      requestJson<ProfileData>({
        url: this.authUrl('/profile'),
        method: 'GET',
        bearerToken: accessToken,
        timeout: this.timeout
      }),
      userId
    )
    const session = this.getSessionOrThrow(userId)
    this.profilesByUserId.set(session.userId, profile)
    return profile
  }

  async refreshAccessToken(userId?: string) {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow(userId)

    try {
      const result = await this.createSession(session.refreshToken)

      this.setSessionForUser({
        ...session,
        accessToken: result.access_token
      })
      this.touchUser(session.userId)
      this.notifyListeners(session.userId)

      return result.access_token
    } catch (error) {
      this.clearSessionForUser(session.userId)
      this.setCurrentSessionFromOrder()
      this.notifyListeners(session.userId)
      throw error
    }
  }

  async logoutUser(userId?: string) {
    const session = this.getSession(userId ?? this.currentUser?.id)
    try {
      if (session) {
        await requestJson({
          url: this.authUrl('/session'),
          method: 'DELETE',
          bearerToken: session.refreshToken,
          timeout: this.timeout
        })
      }
    } finally {
      if (session) {
        this.clearSessionForUser(session.userId)
        this.notifyListeners(session.userId)
      }
      this.setCurrentSessionFromOrder()
    }
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
}
