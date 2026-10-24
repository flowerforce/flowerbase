import { Credentials } from './credentials'
import { normalizeFunctionResponse } from './functions'
import { FlowerbaseHttpError, requestJson, requestStream } from './http'
import { SessionManager } from './session'
import {
  AppConfig,
  CredentialsLike,
  FunctionCallPayload,
  MongoDbServiceArguments,
  MongoDbServiceName,
  ProfileData,
  SessionData
} from './types'
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
  private readonly sessionControllers = new Map<string, AbortController>()
  private readonly pendingRefreshes = new Map<
    string,
    { signal: AbortSignal; promise: Promise<string> }
  >()
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
    resetPassword: (input: {
      token: string
      tokenId: string
      password: string
    }) => Promise<unknown>
  }

  constructor(idOrConfig: string | AppConfig) {
    const config = typeof idOrConfig === 'string' ? { id: idOrConfig } : idOrConfig
    this.id = config.id
    this.baseUrl = (config.baseUrl ?? '').replace(/\/$/, '')
    this.timeout = config.timeout ?? 10000
    this.sessionManager = new SessionManager(this.id)
    this.restorePersistedUsers()
    this.restoreCurrentSession()
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
      [...activeUsers, ...loggedOutUsers].map((userId) => [
        userId,
        this.usersById.get(userId)!
      ])
    )
    return users
  }

  private persistSessionsByUser() {
    this.sessionManager.setSessionsByUser(
      Object.fromEntries(this.sessionsByUserId.entries())
    )
  }

  private persistUsersOrder() {
    this.sessionManager.setUsersOrder(this.usersOrder)
  }

  private restorePersistedUsers() {
    const persistedSessionsByUser = this.sessionManager.getSessionsByUser()
    for (const [userId, session] of Object.entries(persistedSessionsByUser)) {
      this.sessionsByUserId.set(userId, session)
    }

    const persistedOrder = this.sessionManager.getUsersOrder()
    const nextUsersOrder: string[] = []
    for (const userId of persistedOrder) {
      if (!nextUsersOrder.includes(userId)) {
        nextUsersOrder.push(userId)
      }
    }
    for (const userId of this.sessionsByUserId.keys()) {
      if (!nextUsersOrder.includes(userId)) {
        nextUsersOrder.push(userId)
      }
    }
    this.usersOrder = nextUsersOrder

    for (const userId of this.usersOrder) {
      this.getOrCreateUser(userId)
    }
  }

  private restoreCurrentSession() {
    const currentSession = this.sessionManager.get()
    if (currentSession?.userId) {
      this.sessionsByUserId.set(currentSession.userId, currentSession)
      this.getOrCreateUser(currentSession.userId)
      this.touchUser(currentSession.userId)
      this.persistSessionsByUser()
      return
    }

    this.setCurrentSessionFromOrder()
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
    if (this.sessionManager.get()?.userId === session.userId) {
      this.sessionManager.set(session)
    }
    this.persistSessionsByUser()
  }

  private clearSessionForUser(userId: string) {
    const controller = this.sessionControllers.get(userId)
    this.sessionControllers.delete(userId)
    this.pendingRefreshes.delete(userId)
    this.sessionsByUserId.delete(userId)
    this.profilesByUserId.delete(userId)
    this.persistSessionsByUser()
    this.setCurrentSessionFromOrder()
    controller?.abort()
  }

  private getSessionController(userId: string): AbortController {
    const existing = this.sessionControllers.get(userId)
    if (existing) return existing
    const controller = new AbortController()
    this.sessionControllers.set(userId, controller)
    return controller
  }

  getSessionSignal(userId: string): AbortSignal {
    this.getSessionOrThrow(userId)
    return this.getSessionController(userId).signal
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

  private async createSession(
    refreshToken: string,
    signal: AbortSignal
  ): Promise<SessionResponse> {
    return requestJson<SessionResponse>({
      url: this.authUrl('/session'),
      method: 'POST',
      bearerToken: refreshToken,
      timeout: this.timeout,
      signal
    })
  }

  private async bootstrapSessionOnLoad(): Promise<void> {
    await this.sessionManager.whenReady()
    this.restorePersistedUsers()
    this.restoreCurrentSession()

    const session = this.sessionManager.get()
    if (!session || !this.sessionManager.hasPersistentStorage()) {
      return
    }

    try {
      await this.refreshSession(session, this.getSessionSignal(session.userId))
    } catch {
      // Refresh handles failed sessions; superseded bootstrap results are ignored.
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
    this.clearSessionForUser(data.user_id)
    const signal = this.getSessionController(data.user_id).signal
    const sessionResult = await this.createSession(data.refresh_token, signal)
    signal.throwIfAborted()
    const session: SessionData = {
      accessToken: sessionResult.access_token,
      refreshToken: data.refresh_token,
      userId: data.user_id
    }
    this.setSessionForUser(session)
    const user = this.getOrCreateUser(data.user_id)
    user.setProviderType(providerType)
    this.touchUser(data.user_id)
    this.setCurrentSessionFromOrder()
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
    await this.sessionManager.whenReady()
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
      const result = await this.postProvider<LoginResponse>(
        '/custom-function/login',
        credentials.payload
      )
      return this.setLoggedInUser(result, 'custom-function')
    }

    if (credentials.provider === 'custom-token') {
      const result = await this.postProvider<LoginResponse>('/custom-token/login', {
        token: credentials.token
      })
      return this.setLoggedInUser(result, 'custom-token')
    }

    const unsupportedProvider: never = credentials
    throw new Error(
      `Unsupported credentials provider: ${JSON.stringify(unsupportedProvider)}`
    )
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
    await this.requestWithAccessToken(
      (accessToken, signal) =>
        requestJson({
          url: this.authUrl('/delete'),
          method: 'DELETE',
          bearerToken: accessToken,
          timeout: this.timeout,
          signal
        }),
      user.id
    )
    await this.removeUser(user)
  }

  getSessionOrThrow(userId?: string) {
    const targetUserId = userId ?? this.currentUser?.id
    const session = targetUserId
      ? this.sessionsByUserId.get(targetUserId)
      : this.sessionManager.get()
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

  private async requestWithAccessToken<T>(
    operation: (accessToken: string, signal: AbortSignal) => Promise<T>,
    userId?: string
  ) {
    const firstSession = this.getSessionOrThrow(userId)
    const signal = this.getSessionSignal(firstSession.userId)
    const execute = async (accessToken: string) => {
      const result = await operation(accessToken, signal)
      signal.throwIfAborted()
      return result
    }
    try {
      return await execute(firstSession.accessToken)
    } catch (error) {
      if (!(error instanceof FlowerbaseHttpError) || error.status !== 401) {
        throw error
      }
      signal.throwIfAborted()
      await this.refreshSession(firstSession, signal)
      signal.throwIfAborted()
      const refreshedSession = this.getSessionOrThrow(firstSession.userId)
      return execute(refreshedSession.accessToken)
    }
  }

  async callFunction(name: string, args: unknown[], userId?: string) {
    await this.ensureSessionBootstrapped()
    const payload: FunctionCallPayload = {
      name,
      arguments: args
    }

    const result = await this.requestWithAccessToken(
      (accessToken, signal) =>
        requestJson<unknown>({
          url: this.functionsUrl(`/call?func=${name}`),
          method: 'POST',
          body: payload,
          bearerToken: accessToken,
          timeout: this.timeout,
          signal
        }),
      userId
    )

    return normalizeFunctionResponse(result)
  }

  async callFunctionStreaming(
    name: string,
    args: unknown[],
    userId?: string
  ): Promise<AsyncIterable<Uint8Array>> {
    await this.ensureSessionBootstrapped()
    const payload: FunctionCallPayload = {
      name,
      arguments: args
    }
    const firstSession = this.getSessionOrThrow(userId)
    const signal = this.getSessionSignal(firstSession.userId)
    const resolveSession = () => {
      signal.throwIfAborted()
      return this.getSessionOrThrow(firstSession.userId)
    }
    const refreshSession = () => {
      signal.throwIfAborted()
      return this.refreshSession(firstSession, signal)
    }
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
              timeout,
              signal
            })
          } catch (error) {
            if (
              !didRefresh &&
              error instanceof FlowerbaseHttpError &&
              error.status === 401
            ) {
              await refreshSession()
              didRefresh = true
              continue
            }
            throw error
          }

          try {
            for await (const chunk of stream) {
              signal.throwIfAborted()
              yield chunk
            }
            return
          } catch (error) {
            if (
              !didRefresh &&
              error instanceof FlowerbaseHttpError &&
              error.status === 401
            ) {
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

  async callService(
    name: string,
    args: MongoDbServiceArguments,
    service: MongoDbServiceName = 'mongodb-atlas',
    userId?: string
  ) {
    await this.ensureSessionBootstrapped()
    const payload: FunctionCallPayload = {
      name,
      service,
      arguments: args
    }

    return this.requestWithAccessToken(
      (accessToken, signal) =>
        requestJson<unknown>({
          url: this.functionsUrl(`/call?col=${args[0].collection}-${name}`),
          method: 'POST',
          body: payload,
          bearerToken: accessToken,
          timeout: this.timeout,
          signal
        }),
      userId
    )
  }

  async getProfile(userId?: string): Promise<ProfileData> {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow(userId)
    const signal = this.getSessionSignal(session.userId)
    const profile = await this.requestWithAccessToken(
      (accessToken, signal) =>
        requestJson<ProfileData>({
          url: this.authUrl('/profile'),
          method: 'GET',
          bearerToken: accessToken,
          timeout: this.timeout,
          signal
        }),
      session.userId
    )
    signal.throwIfAborted()
    this.profilesByUserId.set(session.userId, profile)
    return profile
  }

  async refreshAccessToken(userId?: string) {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow(userId)
    return this.refreshSession(session, this.getSessionSignal(session.userId))
  }

  private refreshSession(session: SessionData, signal: AbortSignal): Promise<string> {
    signal.throwIfAborted()
    const pending = this.pendingRefreshes.get(session.userId)
    if (pending?.signal === signal) {
      return pending.promise
    }

    const promise = (async () => {
      try {
        const result = await this.createSession(session.refreshToken, signal)
        signal.throwIfAborted()
        this.setSessionForUser({ ...session, accessToken: result.access_token })
        this.notifyListeners(session.userId)
        return result.access_token
      } catch (error) {
        if (!signal.aborted) {
          this.clearSessionForUser(session.userId)
          this.notifyListeners(session.userId)
        }
        throw error
      } finally {
        if (this.pendingRefreshes.get(session.userId)?.signal === signal) {
          this.pendingRefreshes.delete(session.userId)
        }
      }
    })()

    this.pendingRefreshes.set(session.userId, { signal, promise })
    return promise
  }

  async logoutUser(userId?: string) {
    await this.sessionManager.whenReady()
    const targetUserId = userId ?? this.currentUser?.id
    if (!targetUserId) return
    const session = this.getSession(targetUserId)
    this.clearSessionForUser(targetUserId)
    this.notifyListeners(targetUserId)
    if (!session) return
    await requestJson({
      url: this.authUrl('/session'),
      method: 'DELETE',
      bearerToken: session.refreshToken,
      timeout: this.timeout
    })
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
