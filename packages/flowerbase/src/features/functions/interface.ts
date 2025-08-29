import { FastifyInstance } from 'fastify'
import { Document } from 'mongodb'
import { GetOperatorsFunction } from '../../services/mongodb-atlas/model'
import { Rules } from '../rules/interface'

export interface FunctionConfig {
  name: string
  private?: boolean
  run_as_system?: boolean
  disable_arg_logs?: boolean
}

export type Function = Omit<FunctionConfig, 'name'> & { code: string }

export type Functions = Record<string, Function>

export type RegisterFunctionsParams = {
  app: FastifyInstance
  functionsList: Functions
  rulesList: Rules
}

export type ExecuteQueryParams = {
  currentMethod: ReturnType<GetOperatorsFunction>[keyof ReturnType<GetOperatorsFunction>]
  query: Parameters<GetOperatorsFunction>
  update: Document
  document: Document
  documents: Document[]
  pipeline: Document[]
}

type FunctionsControllerOptions = {
  functionsList: Functions
  rules: Rules
}

export type FunctionController = (
  app: FastifyInstance,
  { functionsList, rules }: FunctionsControllerOptions
) => Promise<void>
