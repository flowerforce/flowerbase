import { FastifyInstance } from 'fastify'
import { Arguments, User } from '../../auth/dtos'
import { Function, Functions } from '../../features/functions/interface'
import { Rules } from '../../features/rules/interface'
import { Services } from '../../services/interface'

export interface GenerateContextParams {
  app: FastifyInstance
  currentFunction: Function
  functionsList: Functions
  rules: Rules
  user: User
  services: Services
  args: Arguments
}

export interface GenerateContextDataParams extends Omit<GenerateContextParams, 'args'> {
  GenerateContext: (params: GenerateContextParams) => Promise<void>
}
