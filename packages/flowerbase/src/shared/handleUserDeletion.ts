import { ObjectId } from "bson"
import { AUTH_CONFIG, DB_NAME } from "../constants"
import { emitServiceEvent } from "../services/monitoring"
import { HandleUserDeletion } from "./models/handleUserDeletion.model"

/**
 * Delete user
 *
 * @param {FastifyInstance} app The Fastify instance.
 * @param {Object} [opt] The options from the context
 * @returns {Promise<DeleteResult>} A promise resolving to the result of the delete operation.
 */
const handleUserDeletion: HandleUserDeletion = (app, opt) => async ({ id, email }) => {
    const { run_as_system } = opt ?? {}
    const origin = opt?.monitoring?.invokedFrom
    const meta = { action: 'deleteUser', id, email }
    emitServiceEvent({
        type: 'auth',
        source: 'service:auth',
        message: 'auth deleteUser',
        data: meta,
        origin
    })

    try {
        if (!run_as_system) {
            throw new Error('only run_as_system')
        }

        if (!id && !email) {
            throw new Error('Missing user identifier')
        }

        const { authCollection } = AUTH_CONFIG
        const mongo = app?.mongo
        const db = mongo.client.db(DB_NAME)
        const collection = db.collection<Record<string, unknown>>(authCollection!)
        let query: Record<string, unknown>

        if (id) {
            let parsedId: ObjectId | string = id
            try {
                parsedId = new ObjectId(id)
            } catch {
                parsedId = id
            }
            query = { _id: parsedId }
        } else {
            query = { email }
        }

        return await collection.deleteOne(query)
    } catch (error) {
        emitServiceEvent({
            type: 'auth',
            source: 'service:auth',
            message: 'auth deleteUser failed',
            data: meta,
            error,
            origin
        })
        throw error
    }
}

export default handleUserDeletion
