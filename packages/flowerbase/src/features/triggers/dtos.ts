import { FastifyInstance } from 'fastify'
import { Functions } from '../functions/interface'
import { Triggers } from './interface'

export type ActivateTriggersParams = {
  fastify: FastifyInstance
  triggersList: Triggers
  functionsList: Functions
}
