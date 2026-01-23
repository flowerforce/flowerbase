import { FastifyInstance } from "fastify/types/instance"
import handleUserDeletion from "../../../src/shared/handleUserDeletion"
import handleUserRegistration from "../../../src/shared/handleUserRegistration"
import { Options } from "../../shared/models/handleUserRegistration.model"

type EmailPasswordAuth = {
    registerUser: ReturnType<typeof handleUserRegistration>
    deleteUser: ReturnType<typeof handleUserDeletion>
}

type AuthMethods = {
    emailPasswordAuth: EmailPasswordAuth
}

export type AuthServiceType = (app: FastifyInstance, options: Options) => AuthMethods
