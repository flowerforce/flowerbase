import { createFunctionsProxy } from './functions'
import { createMongoClient } from './mongo'
import { MongoClientLike, ProfileData, UserLike } from './types'
import type { App } from './app'

export class User implements UserLike {
  id: string
  profile?: { email?: string; [key: string]: unknown }
  private readonly app: App

  functions: Record<string, (...args: unknown[]) => Promise<unknown>>

  constructor(app: App, id: string) {
    this.app = app
    this.id = id
    this.functions = createFunctionsProxy((name, args) => this.app.callFunction(name, args))
  }

  async logOut() {
    await this.app.logoutUser()
  }

  async refreshAccessToken() {
    return this.app.refreshAccessToken()
  }

  async refreshCustomData(): Promise<ProfileData> {
    const profile = await this.app.getProfile()
    this.profile = profile.data
    return profile
  }

  mongoClient(serviceName: string): MongoClientLike {
    if (serviceName !== 'mongodb-atlas') {
      throw new Error(`Unsupported service "${serviceName}"`)
    }
    return createMongoClient(this.app)
  }
}
