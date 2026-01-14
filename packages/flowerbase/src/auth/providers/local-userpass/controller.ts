import { FastifyInstance } from 'fastify'
import { ObjectId } from 'mongodb'
import { AUTH_CONFIG, DB_NAME, DEFAULT_CONFIG } from '../../../constants'
import handleUserRegistration from '../../../shared/handleUserRegistration'
import { PROVIDER } from '../../../shared/models/handleUserRegistration.model'
import { StateManager } from '../../../state'
import { GenerateContext } from '../../../utils/context'
import { comparePassword, generateToken, hashPassword, hashToken } from '../../../utils/crypto'
import {
  AUTH_ENDPOINTS,
  AUTH_ERRORS,
  CONFIRM_RESET_SCHEMA,
  CONFIRM_USER_SCHEMA,
  LOGIN_SCHEMA,
  REGISTRATION_SCHEMA,
  RESET_CALL_SCHEMA,
  RESET_SEND_SCHEMA
} from '../../utils'
import {
  ConfirmResetPasswordDto,
  ConfirmUserDto,
  LoginDto,
  RegistrationDto,
  ResetPasswordCallDto,
  ResetPasswordSendDto
} from './dtos'

const rateLimitStore = new Map<string, number[]>()

const isRateLimited = (key: string, maxAttempts: number, windowMs: number) => {
  const now = Date.now()
  const existing = rateLimitStore.get(key) ?? []
  const recent = existing.filter((timestamp) => now - timestamp < windowMs)
  recent.push(now)
  rateLimitStore.set(key, recent)
  return recent.length > maxAttempts
}
/**
 * Controller for handling local user registration and login.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function localUserPassController(app: FastifyInstance) {
  const { authCollection, userCollection, user_id_field } = AUTH_CONFIG
  const { resetPasswordCollection } = AUTH_CONFIG
  const { refreshTokensCollection } = AUTH_CONFIG
  const db = app.mongo.client.db(DB_NAME)
  const resetPasswordTtlSeconds = DEFAULT_CONFIG.RESET_PASSWORD_TTL_SECONDS
  const rateLimitWindowMs = DEFAULT_CONFIG.AUTH_RATE_LIMIT_WINDOW_MS
  const loginMaxAttempts = DEFAULT_CONFIG.AUTH_LOGIN_MAX_ATTEMPTS
  const registerMaxAttempts = DEFAULT_CONFIG.AUTH_REGISTER_MAX_ATTEMPTS
  const resetMaxAttempts = DEFAULT_CONFIG.AUTH_RESET_MAX_ATTEMPTS
  const refreshTokenTtlMs = DEFAULT_CONFIG.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

  try {
    await db.collection(resetPasswordCollection).createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: resetPasswordTtlSeconds }
    )
  } catch (error) {
    console.error('Failed to ensure reset password TTL index', error)
  }

  try {
    await db.collection(refreshTokensCollection).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    )
  } catch (error) {
    console.error('Failed to ensure refresh token TTL index', error)
  }
  const handleResetPasswordRequest = async (
    email: string,
    password?: string,
    extraArguments?: unknown[]
  ) => {
    const { resetPasswordConfig } = AUTH_CONFIG
    const authUser = await db.collection(authCollection!).findOne({
      email
    })

    if (!authUser) {
      return
    }

    const token = generateToken()
    const tokenId = generateToken()

    await db
      ?.collection(resetPasswordCollection)
      .updateOne(
        { email },
        { $set: { token, tokenId, email, createdAt: new Date() } },
        { upsert: true }
      )

    if (!resetPasswordConfig.runResetFunction && !resetPasswordConfig.resetFunctionName) {
      throw new Error(AUTH_ERRORS.MISSING_RESET_FUNCTION)
    }

    if (resetPasswordConfig.runResetFunction && resetPasswordConfig.resetFunctionName) {
      const functionsList = StateManager.select('functions')
      const services = StateManager.select('services')
      const currentFunction = functionsList[resetPasswordConfig.resetFunctionName]
      const baseArgs = { token, tokenId, email, password, username: email }
      const args = Array.isArray(extraArguments) ? [baseArgs, ...extraArguments] : [baseArgs]
      await GenerateContext({
        args,
        app,
        rules: {},
        user: {},
        currentFunction,
        functionsList,
        services
      })
      return
    }

  }

  /**
   * Endpoint for user registration.
   *
   * @route {POST} /register
   * @param {RegistrationDto} req - The request object with registration data.
   * @param {FastifyReply} res - The response object.
   * @returns {Promise<Object>} A promise resolving with the newly created user's ID.
   */
  app.post<RegistrationDto>(
    AUTH_ENDPOINTS.REGISTRATION,
    {
      schema: REGISTRATION_SCHEMA
    },
    async (req, res) => {
      const key = `register:${req.ip}`
      if (isRateLimited(key, registerMaxAttempts, rateLimitWindowMs)) {
        res.status(429).send({ message: 'Too many requests' })
        return
      }

      const result = await handleUserRegistration(app, { run_as_system: true, provider: PROVIDER.LOCAL_USERPASS })({ email: req.body.email.toLowerCase(), password: req.body.password })

      if (!result?.insertedId) {
        res?.status(500)
        throw new Error('Failed to register user')
      }

      res?.status(201)
      return { userId: result.insertedId.toString() }
    }
  )

  /**
   * Endpoint for confirming a user registration.
   *
   * @route {POST} /confirm
   * @param {ConfirmUserDto} req - The request object with confirmation data.
   * @returns {Promise<Object>} A promise resolving with confirmation status.
   */
  app.post<ConfirmUserDto>(
    AUTH_ENDPOINTS.CONFIRM,
    {
      schema: CONFIRM_USER_SCHEMA
    },
    async (req, res) => {
      const key = `confirm:${req.ip}`
      if (isRateLimited(key, resetMaxAttempts, rateLimitWindowMs)) {
        res.status(429).send({ message: 'Too many requests' })
        return
      }

      const existing = await db.collection(authCollection!).findOne({
        confirmationToken: req.body.token,
        confirmationTokenId: req.body.tokenId
      }) as { _id: ObjectId; status?: string } | null

      if (!existing) {
        res.status(500)
        throw new Error(AUTH_ERRORS.INVALID_TOKEN)
      }

      if (existing.status !== 'confirmed') {
        await db.collection(authCollection!).updateOne(
          { _id: existing._id },
          {
            $set: { status: 'confirmed' },
            $unset: { confirmationToken: '', confirmationTokenId: '' }
          }
        )
      }

      res.status(200)
      return { status: 'confirmed' }
    }
  )

  /**
   * Endpoint for user login.
   *
   * @route {POST} /login
   * @param {LoginDto} req - The request object with login data.
   * @returns {Promise<Object>} A promise resolving with access and refresh tokens.
   */
  app.post<LoginDto>(
    AUTH_ENDPOINTS.LOGIN,
    {
      schema: LOGIN_SCHEMA
    },
    async function (req, res) {
      const key = `login:${req.ip}`
      if (isRateLimited(key, loginMaxAttempts, rateLimitWindowMs)) {
        res.status(429).send({ message: 'Too many requests' })
        return
      }
      const authUser = await db.collection(authCollection!).findOne({
        email: req.body.username
      })

      if (!authUser) {
        throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS)
      }

      const passwordMatches = await comparePassword(
        req.body.password,
        authUser.password
      )

      if (!passwordMatches) {
        throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS)
      }

      const user =
        user_id_field && userCollection
          ? await db!
            .collection(userCollection)
            .findOne({ [user_id_field]: authUser._id.toString() })
          : {}
      delete authUser?.password

      const userWithCustomData = {
        ...authUser,
        user_data: { ...(user || {}), _id: authUser._id },
        data: { email: authUser.email },
        id: authUser._id.toString()
      }

      if (authUser && authUser.status !== 'confirmed') {
        throw new Error(AUTH_ERRORS.USER_NOT_CONFIRMED)
      }

      const refreshToken = this.createRefreshToken(userWithCustomData)
      const refreshTokenHash = hashToken(refreshToken)
      await db.collection(refreshTokensCollection).insertOne({
        userId: authUser._id,
        tokenHash: refreshTokenHash,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + refreshTokenTtlMs),
        revokedAt: null
      })

      return {
        access_token: this.createAccessToken(userWithCustomData),
        refresh_token: refreshToken,
        device_id: '',
        user_id: authUser._id.toString()
      }
    }
  )

  /**
   * Endpoint for reset password.
   *
   * @route {POST} /reset/send
   * @param {ResetPasswordDto} req - The request object with th reset request.
   * @returns {Promise<void>}
   */
  app.post<ResetPasswordSendDto>(
    AUTH_ENDPOINTS.RESET,
    {
      schema: RESET_SEND_SCHEMA
    },
    async function (req, res) {
      const key = `reset:${req.ip}`
      if (isRateLimited(key, resetMaxAttempts, rateLimitWindowMs)) {
        res.status(429)
        return { message: 'Too many requests' }
      }
      await handleResetPasswordRequest(req.body.email)
      res.status(202)
      return {
        status: 'ok'
      }
    }
  )

  app.post<ResetPasswordCallDto>(
    AUTH_ENDPOINTS.RESET_CALL,
    {
      schema: RESET_CALL_SCHEMA
    },
    async function (req, res) {
      const key = `reset:${req.ip}`
      if (isRateLimited(key, resetMaxAttempts, rateLimitWindowMs)) {
        res.status(429)
        return { message: 'Too many requests' }
      }
      await handleResetPasswordRequest(
        req.body.email,
        req.body.password,
        req.body.arguments
      )
      res.status(202)
      return {
        status: 'ok'
      }
    }
  )

  /**
   * Endpoint for confirm reset password.
   *
   * @route {POST} /reset
   * @param {ConfirmResetPasswordDto} req - The request object with reset data.
   * @returns {Promise<void>}
   */
  app.post<ConfirmResetPasswordDto>(
    AUTH_ENDPOINTS.CONFIRM_RESET,
    {
      schema: CONFIRM_RESET_SCHEMA
    },
    async function (req, res) {
      const key = `reset-confirm:${req.ip}`
      if (isRateLimited(key, resetMaxAttempts, rateLimitWindowMs)) {
        res.status(429)
        return { message: 'Too many requests' }
      }
      const { token, tokenId, password } = req.body

      const resetRequest = await db
        ?.collection(resetPasswordCollection)
        .findOne({ token, tokenId })

      if (!resetRequest) {
        throw new Error(AUTH_ERRORS.INVALID_RESET_PARAMS)
      }

      const createdAt = resetRequest.createdAt ? new Date(resetRequest.createdAt) : null
      const isExpired = !createdAt ||
        Number.isNaN(createdAt.getTime()) ||
        Date.now() - createdAt.getTime() > resetPasswordTtlSeconds * 1000

      if (isExpired) {
        await db?.collection(resetPasswordCollection).deleteOne({ _id: resetRequest._id })
        throw new Error(AUTH_ERRORS.INVALID_RESET_PARAMS)
      }
      const hashedPassword = await hashPassword(password)
      await db.collection(authCollection!).updateOne(
        { email: resetRequest.email },
        {
          $set: {
            password: hashedPassword
          }
        }
      )

      await db?.collection(resetPasswordCollection).deleteOne({ _id: resetRequest._id })
    }
  )
}
