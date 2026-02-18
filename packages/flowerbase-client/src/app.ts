import { normalizeFunctionResponse } from './functions'
import { requestJson } from './http'
import { SessionManager } from './session'
import { AppConfig, CredentialsLike, FunctionCallPayload, ProfileData, SessionData } from './types'
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
  readonly id: string
  readonly baseUrl: string
  readonly timeout: number
  private readonly sessionManager: SessionManager
  currentUser: User | null = null
  private readonly sessionBootstrapPromise: Promise<void>

  emailPasswordAuth: {
    registerUser: (input: { email: string; password: string }) => Promise<unknown>
    sendResetPasswordEmail: (email: string) => Promise<unknown>
    callResetPasswordFunction: (email: string, password: string, ...args: unknown[]) => Promise<unknown>
    resetPassword: (input: { token: string; tokenId: string; password: string }) => Promise<unknown>
  }

  constructor(config: AppConfig) {
    this.id = config.id
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.timeout = config.timeout ?? 10000
    this.sessionManager = new SessionManager(this.id)

    const session = this.sessionManager.get()
    if (session?.userId) {
      this.currentUser = new User(this, session.userId)
    }
    this.sessionBootstrapPromise = this.bootstrapSessionOnLoad()

    this.emailPasswordAuth = {
      registerUser: ({ email, password }) =>
        this.postProvider('/local-userpass/register', { email, password }),
      sendResetPasswordEmail: (email) =>
        this.postProvider('/local-userpass/reset/send', { email }),
      callResetPasswordFunction: (email, password, ...args) =>
        this.postProvider('/local-userpass/reset/call', { email, password, arguments: args }),
      resetPassword: ({ token, tokenId, password }) =>
        this.postProvider('/local-userpass/reset', { token, tokenId, password })
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
      this.sessionManager.set({
        ...session,
        accessToken: result.access_token
      })
    } catch {
      this.sessionManager.clear()
      this.currentUser = null
    }
  }

  private async ensureSessionBootstrapped() {
    await this.sessionBootstrapPromise
  }

  private async setLoggedInUser(data: LoginResponse, profileEmail?: string) {
    const sessionResult = await this.createSession(data.refresh_token)
    const session: SessionData = {
      accessToken: sessionResult.access_token,
      refreshToken: data.refresh_token,
      userId: data.user_id
    }
    this.sessionManager.set(session)
    this.currentUser = new User(this, data.user_id)
    if (profileEmail) {
      this.currentUser.profile = { email: profileEmail }
    }
    return this.currentUser
  }

  async logIn(credentials: CredentialsLike) {
    if (credentials.provider === 'local-userpass') {
      const result = await this.postProvider<LoginResponse>('/local-userpass/login', {
        username: credentials.email,
        password: credentials.password
      })
      return this.setLoggedInUser(result, credentials.email)
    }

    if (credentials.provider === 'anon-user') {
      const result = await this.postProvider<LoginResponse>('/anon-user/login', {})
      return this.setLoggedInUser(result)
    }

    const result = await this.postProvider<LoginResponse>('/custom-function/login', credentials.payload)
    return this.setLoggedInUser(result)
  }

  getSessionOrThrow() {
    const session = this.sessionManager.get()
    if (!session) {
      throw new Error('User is not authenticated')
    }
    return session
  }

  async postProvider<T = unknown>(path: string, body: unknown): Promise<T> {
    return requestJson<T>({
      url: this.providerUrl(path),
      method: 'POST',
      body,
      timeout: this.timeout
    })
  }

  async callFunction(name: string, args: unknown[]) {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow()
    const payload: FunctionCallPayload = {
      name,
      arguments: args
    }

    const result = await requestJson<unknown>({
      url: this.functionsUrl('/call'),
      method: 'POST',
      body: payload,
      bearerToken: session.accessToken,
      timeout: this.timeout
    })

    return normalizeFunctionResponse(result)
  }

  async callService(name: string, args: unknown[]) {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow()
    const payload: FunctionCallPayload = {
      name,
      service: 'mongodb-atlas',
      arguments: args
    }

    return requestJson<unknown>({
      url: this.functionsUrl('/call'),
      method: 'POST',
      body: payload,
      bearerToken: session.accessToken,
      timeout: this.timeout
    })
  }

  async getProfile(): Promise<ProfileData> {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow()
    return requestJson<ProfileData>({
      url: this.authUrl('/profile'),
      method: 'GET',
      bearerToken: session.accessToken,
      timeout: this.timeout
    })
  }

  async refreshAccessToken() {
    await this.ensureSessionBootstrapped()
    const session = this.getSessionOrThrow()

    try {
      const result = await this.createSession(session.refreshToken)

      this.sessionManager.set({
        ...session,
        accessToken: result.access_token
      })

      return result.access_token
    } catch (error) {
      this.sessionManager.clear()
      this.currentUser = null
      throw error
    }
  }

  async logoutUser() {
    const session = this.sessionManager.get()
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
      this.sessionManager.clear()
      this.currentUser = null
    }
  }
}
