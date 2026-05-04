import type { FastifyInstance } from "fastify/types/instance"
import { AUTH_CONFIG, AUTH_DB_NAME } from "../constants"
import { emitServiceEvent } from "../services/monitoring"
import { StateManager } from "../state"
import { GenerateContext } from "../utils/context"
import { generateToken, hashPassword } from "../utils/crypto"
import { HandleUserRegistration } from "./models/handleUserRegistration.model"

type ConfirmationResult = { status?: 'success' | 'pending' | 'fail' }

export const sendConfirmationRequest = async (
    app: FastifyInstance,
    email: string
) => {
    const { authCollection } = AUTH_CONFIG
    const localUserpassConfig = AUTH_CONFIG.localUserpassConfig
    const autoConfirm = localUserpassConfig?.autoConfirm === true
    const runConfirmationFunction = localUserpassConfig?.runConfirmationFunction === true
    const confirmationFunctionName = localUserpassConfig?.confirmationFunctionName
    const normalizedEmail = email.toLowerCase()
    const mongo = app?.mongo
    const db = mongo.client.db(AUTH_DB_NAME)
    const authUser = await db?.collection(authCollection!).findOne({ email: normalizedEmail }) as {
        status?: string
    } | null

    if (!authUser) {
        return null
    }

    if (authUser.status === 'confirmed' || autoConfirm) {
        return { status: 'success' as const }
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
        { email: normalizedEmail },
        {
            $set: {
                status: 'pending',
                confirmationToken: token,
                confirmationTokenId: tokenId
            }
        }
    )

    let confirmationStatus: ConfirmationResult['status'] = 'fail'
    try {
        const response = await GenerateContext({
            args: [{
                token,
                tokenId,
                username: normalizedEmail
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
            { email: normalizedEmail },
            {
                $set: { status: 'confirmed' },
                $unset: { confirmationToken: '', confirmationTokenId: '' }
            }
        )
        return { status: 'success' as const }
    }

    if (confirmationStatus === 'pending') {
        return { status: 'pending' as const }
    }

    await db?.collection(authCollection!).updateOne(
        { email: normalizedEmail },
        {
            $set: { status: 'failed' },
            $unset: { confirmationToken: '', confirmationTokenId: '' }
        }
    )

    return { status: 'fail' as const }
}

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
        const mongo = app?.mongo
        const db = mongo.client.db(AUTH_DB_NAME)
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

        await sendConfirmationRequest(app, email)
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
