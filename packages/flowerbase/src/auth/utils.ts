import fs from 'fs'
import path from 'path'

export const LOGIN_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      username: { type: 'string' },
      password: { type: 'string' }
    },
    required: ['username', 'password']
  }
}

export const RESET_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      password: { type: 'string' }
    },
    required: ['email', 'password']
  }
}

export const CONFIRM_RESET_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      password: { type: 'string' },
      token: { type: 'string' },
      tokenId: { type: 'string' }
    },
    required: ['password', 'token', 'tokenId']
  }
}

export const REGISTRATION_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      email: { type: 'string' },
      password: { type: 'string' }
    },
    required: ['email', 'password']
  }
}

export enum AUTH_ENDPOINTS {
  LOGIN = '/login',
  REGISTRATION = '/register',
  PROFILE = '/profile',
  SESSION = '/session',
  RESET = '/reset/call',
  CONFIRM_RESET = "/reset",
  FIRST_USER = '/setup/first-user'
}

export enum AUTH_ERRORS {
  INVALID_CREDENTIALS = 'Invalid credentials',
  INVALID_TOKEN = 'Invalid refresh token provided',
  INVALID_RESET_PARAMS = 'Invalid token or tokenId provided'
}

export interface AuthConfig {
  auth_collection?: string
  'api-key': ApiKey
  'local-userpass': LocalUserpass
  'custom-function': CustomFunction
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

export interface Config {
  autoConfirm: boolean
  resetFunctionName: string
  resetPasswordUrl: string
  runConfirmationFunction: boolean
  runResetFunction: boolean
  mailConfig: {
    from: string
    subject: string
    mailToken: string
  }
}

export interface CustomUserDataConfig {
  enabled: boolean
  mongo_service_name: string
  database_name: string
  collection_name: string
  user_id_field: string
  on_user_creation_function_name: string
}

export const PROVIDER_TYPE = 'local-userpass'

/**
 * > Loads the auth config json file
 * @testable
 */
export const loadAuthConfig = (): AuthConfig => {
  const authPath = path.join(require.main!.path, 'auth/providers.json')
  return JSON.parse(fs.readFileSync(authPath, 'utf-8'))
}

/**
 * > Loads the custom user data config json file
 * @testable
 */
export const loadCustomUserData = (): CustomUserDataConfig => {
  const userDataPath = path.join(require.main!.path, 'auth/custom_user_data.json')
  return JSON.parse(fs.readFileSync(userDataPath, 'utf-8'))
}

export const getMailConfig = (
  resetPasswordConfig: Config,
  token: string,
  tokenId: string
) => {
  const { mailConfig, resetPasswordUrl } = resetPasswordConfig
  const ENV_PREFIX = 'ENV'
  const { from, subject, mailToken } = mailConfig

  const [fromPrefix, fromPath] = from.split('.')

  if (!fromPath) {
    throw new Error(`Invalid fromPath: ${fromPath}`)
  }

  const currentSender = (fromPrefix === ENV_PREFIX ? process.env[fromPath] : from) ?? ''
  const [subjectPrefix, subjectPath] = subject.split('.')

  if (!subjectPath) {
    throw new Error(`Invalid subjectPath: ${subjectPath}`)
  } 

  const currentSubject =
    (subjectPrefix === ENV_PREFIX ? process.env[subjectPath] : subject) ?? ''
  const [mailTokenPrefix, mailTokenPath] = mailToken.split('.')

  if (!mailTokenPath) {
    throw new Error(`Invalid mailTokenPath: ${mailTokenPath}`)
  } 

  const currentMailToken =
    (mailTokenPrefix === 'ENV' ? process.env[mailTokenPath] : mailToken) ?? ''

  const link = `${resetPasswordUrl}/${token}/${tokenId}`
  const body = `<body style="font-family: Arial, sans-serif; background-color: #f4f4f4; text-align: center; padding: 20px;">
  <table width="100%" cellspacing="0" cellpadding="0">
      <tr>
          <td align="center">
              <table width="600" cellspacing="0" cellpadding="0" style="background: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);">
                  <tr>
                      <td align="center">
                          <h2>Password Reset Request</h2>
                          <p>If you requested a password reset, click the button below to reset your password.</p>
                          <p>If you did not request this, please ignore this email.</p>
                          <p>
                              <a href="${link}" style="display: inline-block; padding: 12px 20px; font-size: 16px; color: #ffffff; background: #007bff; text-decoration: none; border-radius: 5px;">Reset Password</a>
                          </p>
                          <p style="margin-top: 20px; font-size: 12px; color: #777;">If the button does not work, copy and paste the following link into your browser:</p>
                          <p style="font-size: 12px; color: #777;">${link}</p>
                      </td>
                  </tr>
              </table>
          </td>
      </tr>
  </table>
</body>`
  return {
    from: currentSender ?? '',
    subject: currentSubject,
    mailToken: currentMailToken,
    body
  }
}
