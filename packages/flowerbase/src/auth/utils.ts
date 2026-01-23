import crypto from "crypto";
import fs from 'fs'
import path from 'path'

const CHARSET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};:,.<>?";
export const LOGIN_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      username: {
        type: 'string',
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        minLength: 5,
        maxLength: 254
      },
      password: { type: 'string', minLength: 6, maxLength: 128 }
    },
    required: ['username', 'password']
  }
}

export const RESET_SEND_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        minLength: 5,
        maxLength: 254
      }
    },
    required: ['email']
  }
}

export const RESET_CALL_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        minLength: 5,
        maxLength: 254
      },
      password: { type: 'string', minLength: 6, maxLength: 128 },
      arguments: { type: 'array' }
    },
    required: ['email', 'password']
  }
}

export const CONFIRM_RESET_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      password: { type: 'string', minLength: 6, maxLength: 128 },
      token: { type: 'string' },
      tokenId: { type: 'string' }
    },
    required: ['password', 'token', 'tokenId']
  }
}

export const CONFIRM_USER_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      token: { type: 'string' },
      tokenId: { type: 'string' }
    },
    required: ['token', 'tokenId']
  }
}

export const RESET_SCHEMA = RESET_SEND_SCHEMA

export const REGISTRATION_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
        minLength: 5,
        maxLength: 254
      },
      password: { type: 'string', minLength: 6, maxLength: 128 }
    },
    required: ['email', 'password']
  }
}

export enum AUTH_ENDPOINTS {
  LOGIN = '/login',
  REGISTRATION = '/register',
  CONFIRM = '/confirm',
  PROFILE = '/profile',
  SESSION = '/session',
  RESET = '/reset/send',
  RESET_CALL = '/reset/call',
  CONFIRM_RESET = "/reset",
  FIRST_USER = '/setup/first-user'
}

export enum AUTH_ERRORS {
  INVALID_CREDENTIALS = 'Invalid credentials',
  INVALID_TOKEN = 'Invalid refresh token provided',
  INVALID_RESET_PARAMS = 'Invalid token or tokenId provided',
  MISSING_RESET_FUNCTION = 'Missing reset function',
  USER_NOT_CONFIRMED = 'User not confirmed'
}

export interface AuthConfig {
  auth_collection?: string
  'api-key': ApiKey
  'local-userpass': LocalUserpass
  'custom-function': CustomFunction
  'anon-user'?: AnonUser
}

interface ApiKey {
  name: string
  type: string
  disabled: boolean
}
interface LocalUserpass {
  name: string
  type: string
  disabled: boolean
  config: Config
}

interface CustomFunction {
  name: "custom-function",
  type: "custom-function",
  disabled: boolean,
  config: {
    "authFunctionName": string
  }
}

export interface AnonUser {
  name: "anon-user"
  type: "anon-user"
  disabled: boolean
}

export interface Config {
  autoConfirm: boolean
  confirmationFunctionName?: string
  resetFunctionName: string
  resetPasswordUrl: string
  runConfirmationFunction: boolean
  runResetFunction: boolean
}

export interface CustomUserDataConfig {
  enabled: boolean
  mongo_service_name: string
  database_name: string
  collection_name: string
  user_id_field: string
  on_user_creation_function_name: string
}

const resolveAppPath = () =>
  process.env.FLOWERBASE_APP_PATH ?? require.main?.path ?? process.cwd()


/**
 * > Loads the auth config json file
 * @testable
 */
export const loadAuthConfig = (): AuthConfig => {
  const authPath = path.join(resolveAppPath(), 'auth/providers.json')
  return JSON.parse(fs.readFileSync(authPath, 'utf-8'))
}

/**
 * > Loads the custom user data config json file
 * @testable
 */
export const loadCustomUserData = (): CustomUserDataConfig => {
  const userDataPath = path.join(resolveAppPath(), 'auth/custom_user_data.json')
  return JSON.parse(fs.readFileSync(userDataPath, 'utf-8'))
}

export const generatePassword = (length = 20) => {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join("");
}
