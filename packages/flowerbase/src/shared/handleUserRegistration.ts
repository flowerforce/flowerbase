import { AUTH_CONFIG, DB_NAME } from "../constants"
import { emitServiceEvent } from "../services/monitoring"
import { StateManager } from "../state"
import { GenerateContext } from "../utils/context"
import { generateToken, hashPassword } from "../utils/crypto"
import { HandleUserRegistration } from "./models/handleUserRegistration.model"

/**
 * Register user
 *
 * @param {FastifyInstance} app The Fastify instance.
 * @param {Object} [opt] The options from the context
 * @returns {Promise<InsertOneResult<Document>>} A promise resolving to the result of the insert operation.
 */
const handleUserRegistration: HandleUserRegistration = (app, opt) => async ({ email, password }) => {
    const { run_as_system, skipUserCheck, provider } = opt ?? {}
    const origin = opt?.monitoring?.invokedFrom
    const meta = { action: 'registerUser', email, provider }
    emitServiceEvent({
        type: 'auth',
        source: 'service:auth',
        message: 'auth registerUser',
        data: meta,
        origin
    })

    try {
        if (!run_as_system) {
            throw new Error('only run_as_system')
        }

        const { authCollection } = AUTH_CONFIG
        const localUserpassConfig = AUTH_CONFIG.localUserpassConfig
        const autoConfirm = localUserpassConfig?.autoConfirm === true
        const runConfirmationFunction = localUserpassConfig?.runConfirmationFunction === true
        const confirmationFunctionName = localUserpassConfig?.confirmationFunctionName
        const mongo = app?.mongo
        const db = mongo.client.db(DB_NAME)
        const hashedPassword = await hashPassword(password)

        const existingUser = await db?.collection(authCollection!).findOne({ email })
        if (existingUser && !skipUserCheck) {
            throw new Error('This email address is already used')
        }

        const result = await db?.collection(authCollection!).insertOne({
            email,
            password: hashedPassword,
            status: (skipUserCheck || autoConfirm) ? 'confirmed' : 'pending',
            createdAt: new Date(),
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

        if (!result?.insertedId || skipUserCheck || autoConfirm) {
            return result
        }

        if (!runConfirmationFunction) {
            throw new Error('Missing confirmation function')
        }

        if (!confirmationFunctionName) {
            throw new Error('Missing confirmation function name')
        }

        const functionsList = StateManager.select('functions')
        const services = StateManager.select('services')
        const confirmationFunction = functionsList[confirmationFunctionName]
        if (!confirmationFunction) {
            throw new Error(`Confirmation function not found: ${confirmationFunctionName}`)
        }

        const token = generateToken()
        const tokenId = generateToken()
        await db?.collection(authCollection!).updateOne(
            { _id: result.insertedId },
            {
                $set: {
                    confirmationToken: token,
                    confirmationTokenId: tokenId
                }
            }
        )

        type ConfirmationResult = { status?: 'success' | 'pending' | 'fail' }
        let confirmationStatus: ConfirmationResult['status'] = 'fail'
        try {
            const response = await GenerateContext({
                args: [{
                    token,
                    tokenId,
                    username: email
                }],
                app,
                rules: {},
                user: {},
                currentFunction: confirmationFunction,
                functionName: confirmationFunctionName,
                functionsList,
                services,
                runAsSystem: true
            }) as ConfirmationResult
            confirmationStatus = response?.status ?? 'fail'
        } catch {
            confirmationStatus = 'fail'
        }

        if (confirmationStatus === 'success') {
            await db?.collection(authCollection!).updateOne(
                { _id: result.insertedId },
                {
                    $set: { status: 'confirmed' },
                    $unset: { confirmationToken: '', confirmationTokenId: '' }
                }
            )
            return result
        }

        if (confirmationStatus === 'pending') {
            return result
        }

        await db?.collection(authCollection!).updateOne(
            { _id: result.insertedId },
            {
                $set: { status: 'failed' },
                $unset: { confirmationToken: '', confirmationTokenId: '' }
            }
        )
        return result
    } catch (error) {
        emitServiceEvent({
            type: 'auth',
            source: 'service:auth',
            message: 'auth registerUser failed',
            data: meta,
            error,
            origin
        })
        throw error
    }

}

export default handleUserRegistration
