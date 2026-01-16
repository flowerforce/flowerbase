import { FastifyInstance } from 'fastify'
import { Services } from '../../services/interface'
import { Function, Functions } from '../functions/interface'

export interface Trigger {
  name: string
  type: TriggerType
  disabled: boolean
  config: Config
  event_processors: {
    FUNCTION: {
      config: {
        function_name: string
      }
    }
  }
}

type Config = {
  collection: string
  database: string
  full_document: boolean
  full_document_before_change: boolean
  isAutoTrigger?: boolean
  match: Record<string, unknown>
  operation_types: string[]
  operation_type?: 'CREATE' | 'DELETE'
  project: Record<string, unknown>
  service_name: string
  skip_catchup_events: boolean
  tolerate_resume_errors: boolean
  unordered: boolean
  schedule: string
}

export type TriggerType = 'SCHEDULED' | 'DATABASE' | 'AUTHENTICATION'
export type Triggers = { fileName: string; content: Trigger }[]

export type HandlerParams = {
  config: Config
  triggerHandler: Function
  app: FastifyInstance
  services: Services
  functionsList: Functions
}
