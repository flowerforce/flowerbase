import { FastifyInstance } from "fastify/types/instance"
import { User } from "../../auth/dtos"
import { Rules } from "../../features/rules/interface"

type RegistrationParams = {
  email: string
  password: string
}

export type Options = {
  user?: User
  rules?: Rules
  skipUserCheck?: boolean
  provider?: PROVIDER
  run_as_system?: boolean
}

type RegistrationResult = {
  insertedId?: {
    toString: () => string
  }
}

export type HandleUserRegistration = (
  app: FastifyInstance,
  opt: Options
) => (params: RegistrationParams) => Promise<RegistrationResult>

export enum PROVIDER {
  LOCAL_USERPASS = "local-userpass",
  CUSTOM_FUNCTION = "custom-function"
}
