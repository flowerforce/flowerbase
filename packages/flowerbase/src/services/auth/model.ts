import { FastifyInstance } from "fastify/types/instance"
import handleUserRegistration from "../../../src/shared/handleUserRegistration"
import { Options } from "../../shared/models/handleUserRegistration.model"

type EmailPasswordAuth = {
    registerUser: ReturnType<typeof handleUserRegistration>
}

type AuthMethods = {
    emailPasswordAuth: EmailPasswordAuth
}

export type AuthServiceType = (app: FastifyInstance, options: Options) => AuthMethods