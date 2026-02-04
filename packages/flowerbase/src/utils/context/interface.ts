import { FastifyInstance, FastifyRequest } from 'fastify'
import { Arguments, User } from '../../auth/dtos'
import { Function, Functions } from '../../features/functions/interface'
import { Rules } from '../../features/rules/interface'
import { Services } from '../../services/interface'

export interface GenerateContextParams {
  app: FastifyInstance
  currentFunction: Function
  functionsList: Functions
  functionName?: string
  rules: Rules
  user: User
  services: Services
  args: Arguments
  runAsSystem?: boolean
  deserializeArgs?: boolean
  enqueue?: boolean
  request?: ContextRequest
}

type ContextRequest = Pick<FastifyRequest, "ips" | "host" | "hostname" | "url" | "method" | "ip" | "id">
export interface GenerateContextDataParams extends Omit<GenerateContextParams, 'args'> {
  GenerateContext: (params: GenerateContextParams) => Promise<unknown>
}
