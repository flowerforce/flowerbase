import { FastifyMongoObject } from '@fastify/mongodb/types'
import { AUTH_CONFIG } from '../constants'
import { hashPassword } from '../utils/crypto'
import { HandleUserRegistration } from './models/handleUserRegistration.model'

/**
 * Register user
 *
 * @param {FastifyInstance} app The Fastify instance.
 * @param {Object} [opt] The options from the context
 * @returns {Promise<InsertOneResult<Document>>} A promise resolving to the result of the insert operation.
 */
const handleUserRegistration: HandleUserRegistration =
  (app, opt) =>
  async ({ email, password }) => {
    const { run_as_system, skipUserCheck, provider } = opt ?? {}

    if (!run_as_system) {
      throw new Error('only run_as_system')
    }
    const { authCollection } = AUTH_CONFIG
    const mongo: FastifyMongoObject = app?.mongo
    const db = mongo.client.db(opt.databaseName)
    const hashedPassword = await hashPassword(password)

    const existingUser = await db?.collection(authCollection!).findOne({ email })
    if (existingUser && !skipUserCheck) {
      throw new Error('This email address is already used')
    }

    const result = await db?.collection(authCollection!).insertOne({
      email,
      password: hashedPassword,
      status: skipUserCheck ? 'confirmed' : 'pending',
      custom_data: {
        // TODO: aggiungere dati personalizzati alla registrazione
      },
      identities: [
        {
          provider_type: provider,
          provider_data: { email }
        }
      ]
    })

    await db?.collection(authCollection!).updateOne(
      { email },
      {
        $set: {
          identities: [
            {
              id: result?.insertedId.toString(),
              provider_id: result?.insertedId.toString(),
              provider_type: provider,
              provider_data: { email }
            }
          ]
        }
      }
    )

    return result
  }

export default handleUserRegistration
