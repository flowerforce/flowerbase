import { loadAuthConfig, loadCustomUserData } from './auth/utils'
import { ALLOWED_METHODS } from './'

const parseBoolean = (value?: string) => {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

const {
  database_name,
  collection_name = 'users',
  user_id_field = 'id',
  on_user_creation_function_name
} = loadCustomUserData()
const { auth_collection = 'auth_users', ...configuration } = loadAuthConfig()

export const DEFAULT_CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  MONGODB_URL: process.env.MONGODB_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || '',
  API_VERSION: process.env.API_VERSION || 'v2.0',
  HTTPS_SCHEMA: process.env.HTTPS_SCHEMA || 'https',
  HOST: process.env.HOST || '0.0.0.0',
  ENABLE_LOGGER: process.env.ENABLE_LOGGER,
  RESET_PASSWORD_TTL_SECONDS: Number(process.env.RESET_PASSWORD_TTL_SECONDS) || 3600,
  AUTH_RATE_LIMIT_WINDOW_MS: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  AUTH_LOGIN_MAX_ATTEMPTS: Number(process.env.AUTH_LOGIN_MAX_ATTEMPTS) || 10,
  AUTH_REGISTER_MAX_ATTEMPTS: Number(process.env.AUTH_REGISTER_MAX_ATTEMPTS) || 5,
  AUTH_RESET_MAX_ATTEMPTS: Number(process.env.AUTH_RESET_MAX_ATTEMPTS) || 5,
  REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 60,
  ANON_USER_TTL_SECONDS: Number(process.env.ANON_USER_TTL_SECONDS) || 3 * 60 * 60,
  SWAGGER_ENABLED: parseBoolean(process.env.SWAGGER_ENABLED),
  SWAGGER_UI_USER: process.env.SWAGGER_UI_USER || '',
  SWAGGER_UI_PASSWORD: process.env.SWAGGER_UI_PASSWORD || '',
  MONIT_ENABLED: parseBoolean(process.env.MONIT_ENABLED) ||
    !!(process.env.MONIT_USER && process.env.MONIT_PASSWORD),
  MONIT_USER: process.env.MONIT_USER || process.env.SWAGGER_UI_USER || '',
  MONIT_PASSWORD: process.env.MONIT_PASSWORD || process.env.SWAGGER_UI_PASSWORD || '',
  MONIT_CACHE_HOURS: Number(process.env.MONIT_CACHE_HOURS) || 24,
  MONIT_MAX_EVENTS: Number(process.env.MONIT_MAX_EVENTS) || 5000,
  MONIT_CAPTURE_CONSOLE: parseBoolean(process.env.MONIT_CAPTURE_CONSOLE ?? 'true'),
  MONIT_REDACT_ERROR_DETAILS: parseBoolean(process.env.MONIT_REDACT_ERROR_DETAILS ?? 'true'),
  CORS_OPTIONS: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"] as ALLOWED_METHODS[]
  }
}
export const API_VERSION = `/api/client/${DEFAULT_CONFIG.API_VERSION}`
export const HTTPS_SCHEMA = DEFAULT_CONFIG.HTTPS_SCHEMA
export const DB_NAME = database_name

type AuthProviders = Record<string, { disabled?: boolean; config?: unknown }>
// TODO spostare nell'oggetto providers anche le altre configurazioni
export const AUTH_CONFIG = {
  authCollection: auth_collection,
  userCollection: collection_name,
  resetPasswordCollection: 'reset_password_requests',
  refreshTokensCollection: 'auth_refresh_tokens',
  resetPasswordConfig: configuration['local-userpass']?.config,
  localUserpassConfig: configuration['local-userpass']?.config,
  authProviders: configuration as unknown as AuthProviders,
  user_id_field,
  on_user_creation_function_name,
  providers: {
    "custom-function": configuration['custom-function']?.config,
    "anon-user": configuration['anon-user']
  }
}



export const S3_CONFIG = {
  ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
  SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY
}
