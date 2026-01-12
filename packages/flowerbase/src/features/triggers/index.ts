import { AUTH_CONFIG, DB_NAME } from '../../constants'
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
  console.log('START ACTIVATION TRIGGERS')
  try {
    const triggersToActivate = [...triggersList]
    if (AUTH_CONFIG.on_user_creation_function_name) {
      const alreadyDeclared = triggersToActivate.some(
        (trigger) =>
          trigger.content.type === 'AUTHENTICATION' &&
          trigger.content.event_processors?.FUNCTION?.config?.function_name ===
            AUTH_CONFIG.on_user_creation_function_name
      )
      if (!alreadyDeclared) {
        triggersToActivate.push({
          fileName: '__auto_on_user_creation_trigger__.json',
          content: {
            name: 'onUserCreation',
            type: 'AUTHENTICATION',
            disabled: false,
            config: {
              collection: AUTH_CONFIG.authCollection ?? 'auth_users',
              database: DB_NAME,
              full_document: true,
              full_document_before_change: false,
              match: {},
              operation_types: ['insert', 'update', 'replace'],
              project: {},
              service_name: 'mongodb-atlas',
              skip_catchup_events: false,
              tolerate_resume_errors: false,
              unordered: false,
              schedule: ''
            },
            event_processors: {
              FUNCTION: {
                config: {
                  function_name: AUTH_CONFIG.on_user_creation_function_name
                }
              }
            }
          }
        })
      }
    }

    for await (const trigger of triggersToActivate) {
      const { content } = trigger
      const { type, config, event_processors } = content

      const functionName: keyof Functions = event_processors.FUNCTION.config.function_name
      const triggerHandler = functionsList[functionName] as Function

      await TRIGGER_HANDLERS[type]({
        config,
        triggerHandler,
        app: fastify,
        services,
        functionsList
      })
    }
    console.log('TRIGGERS ACTIVATION COMPLETED')
  } catch (e) {
    console.error('Error while activating triggers', (e as Error).message)
  }
}
