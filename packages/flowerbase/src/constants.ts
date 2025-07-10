import { loadAuthConfig, loadCustomUserData } from './auth/utils'

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
  ENABLE_LOGGER: process.env.ENABLE_LOGGER
}
export const API_VERSION = `/api/client/${DEFAULT_CONFIG.API_VERSION}`
export const HTTPS_SCHEMA = DEFAULT_CONFIG.HTTPS_SCHEMA
export const DB_NAME = database_name
export const AUTH_CONFIG = {
  authCollection: auth_collection,
  userCollection: collection_name,
  resetPasswordCollection: 'reset-password-requests',
  resetPasswordConfig: configuration['local-userpass'].config,
  user_id_field,
  on_user_creation_function_name
}
