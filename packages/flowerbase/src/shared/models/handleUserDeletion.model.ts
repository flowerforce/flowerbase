import { FastifyInstance } from "fastify/types/instance"
import { DeleteResult } from "mongodb"
import { Options } from "./handleUserRegistration.model"

type DeleteUserParams = {
  id?: string
  email?: string
}

export type HandleUserDeletion = (
  app: FastifyInstance,
  opt: Options
) => (params: DeleteUserParams) => Promise<DeleteResult>
