import { FastifyInstance } from 'fastify'
import { Function, Functions } from '../functions/interface'

export type GenerateEndpointsParams = {
  app: FastifyInstance
  functionsList: Functions
  endpointsList: Endpoints
}

export type GenerateHandlerParams = {
  app: FastifyInstance
  currentFunction: Function
  functionsList: Functions
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
