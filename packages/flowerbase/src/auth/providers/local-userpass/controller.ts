import { FastifyInstance } from 'fastify'
import { AUTH_CONFIG, DB_NAME } from '../../../constants'
import { services } from '../../../services'
import handleUserRegistration from '../../../shared/handleUserRegistration'
import { PROVIDER } from '../../../shared/models/handleUserRegistration.model'
import { StateManager } from '../../../state'
import { GenerateContext } from '../../../utils/context'
import { comparePassword, generateToken, hashPassword } from '../../../utils/crypto'
import {
  AUTH_ENDPOINTS,
  AUTH_ERRORS,
  CONFIRM_RESET_SCHEMA,
  LOGIN_SCHEMA,
  REGISTRATION_SCHEMA,
  RESET_CALL_SCHEMA,
  RESET_SEND_SCHEMA
} from '../../utils'
import {
  ConfirmResetPasswordDto,
  LoginDto,
  RegistrationDto,
  ResetPasswordCallDto,
  ResetPasswordSendDto
} from './dtos'
/**
 * Controller for handling local user registration and login.
 * @testable
 * @param {FastifyInstance} app - The Fastify instance.
 */
export async function localUserPassController(app: FastifyInstance) {
  const functionsList = StateManager.select('functions')

  const {
    authCollection,
    userCollection,
    user_id_field,
    on_user_creation_function_name
  } = AUTH_CONFIG
  const db = app.mongo.client.db(DB_NAME)
  const handleResetPasswordRequest = async (
    email: string,
    password?: string,
    extraArguments?: unknown[]
  ) => {
    const { resetPasswordCollection, resetPasswordConfig } = AUTH_CONFIG
    const authUser = await db.collection(authCollection!).findOne({
      email
    })

    if (!authUser) {
      throw new Error(AUTH_ERRORS.INVALID_CREDENTIALS)
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
      const baseArgs = { token, tokenId, email, password }
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
    async function (req) {
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

      if (authUser && authUser.status === 'pending') {
        try {
          await db?.collection(authCollection!).updateOne(
            { _id: authUser._id },
            {
              $set: {
                status: 'confirmed'
              }
            }
          )
        } catch (error) {
          console.log('>>> 🚀 ~ localUserPassController ~ error:', error)
        }
      }

      if (
        authUser &&
        authUser.status === 'pending' &&
        on_user_creation_function_name &&
        functionsList[on_user_creation_function_name]
      ) {
        try {
          await GenerateContext({
            args: [userWithCustomData],
            app,
            rules: {},
            user: userWithCustomData,
            currentFunction: functionsList[on_user_creation_function_name],
            functionsList,
            services
          })
        } catch (error) {
          console.log('localUserPassController - /login - GenerateContext - CATCH:', error)
        }
      }

      return {
        access_token: this.createAccessToken(userWithCustomData),
        refresh_token: this.createRefreshToken(userWithCustomData),
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
    async function (req) {
      await handleResetPasswordRequest(req.body.email)
    }
  )

  app.post<ResetPasswordCallDto>(
    AUTH_ENDPOINTS.RESET_CALL,
    {
      schema: RESET_CALL_SCHEMA
    },
    async function (req) {
      await handleResetPasswordRequest(
        req.body.email,
        req.body.password,
        req.body.arguments
      )
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
    async function (req) {
      const { resetPasswordCollection } = AUTH_CONFIG
      const { token, tokenId, password } = req.body

      const resetRequest = await db
        ?.collection(resetPasswordCollection)
        .findOne({ token, tokenId })

      if (!resetRequest) {
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
