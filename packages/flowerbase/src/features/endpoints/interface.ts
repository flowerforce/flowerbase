import { FastifyInstance } from 'fastify'
import { Function, Functions } from '../functions/interface'
import { Rules } from '../rules/interface'

export type GenerateEndpointsParams = {
  app: FastifyInstance
  functionsList: Functions
  endpointsList: Endpoints
  rulesList: Rules
}

export type GenerateHandlerParams = {
  app: FastifyInstance
  currentFunction: Function
  functionName?: string
  functionsList: Functions
  http_method: string
  rulesList: Rules
}

type HTTP_METHOD<T> = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | T

export type Endpoint<T = 'ALL'> = {
  http_method: HTTP_METHOD<T>
  route: string
  function_name: string
  secret_name: string
  validation_method: string
  respond_result: boolean
  fetch_custom_user_data: boolean
  create_user_on_auth: boolean
  disabled: boolean
}
export type Endpoints<T = 'ALL'> = Endpoint<T>[]
