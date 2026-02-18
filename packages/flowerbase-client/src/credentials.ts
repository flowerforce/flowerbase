import { CredentialsLike } from './types'

export class Credentials {
  static emailPassword(email: string, password: string): CredentialsLike {
    return {
      provider: 'local-userpass',
      email,
      password
    }
  }

  static anonymous(): CredentialsLike {
    return {
      provider: 'anon-user'
    }
  }

  static function(payload: Record<string, unknown>): CredentialsLike {
    return {
      provider: 'custom-function',
      payload
    }
  }
}
