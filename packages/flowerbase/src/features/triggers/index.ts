import { services } from '../../services'
import { Function, Functions } from '../functions/interface'
import { ActivateTriggersParams } from './dtos'
import { TRIGGER_HANDLERS } from './utils'

/**
 * > Used to activate all app triggers
 * @testable
 * @param fastify -> the fastify instance
 * @param triggersList -> the list of all triggers
 * @param functionsList -> the list of all functions
 */
export const activateTriggers = async ({
  fastify,
  triggersList,
  functionsList
}: ActivateTriggersParams) => {
  console.log("START ACTIVATION TRIGGERS")
  try {
    for await (const trigger of triggersList) {
      const { content } = trigger
      const { type, config, event_processors } = content

      const functionName: keyof Functions = event_processors.FUNCTION.config.function_name
      const triggerHandler = functionsList[functionName] as Function

      await TRIGGER_HANDLERS[type]({ config, triggerHandler, app: fastify, services, functionsList })

    }
    console.log("TRIGGERS ACTIVATION COMPLETED")
  } catch (e) {
    console.error('Error while activating triggers', (e as Error).message)
  }
}


