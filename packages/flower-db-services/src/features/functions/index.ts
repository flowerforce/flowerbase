import { API_VERSION } from '../../constants'
import { functionsController } from './controller'
import { RegisterFunctionsParams } from './interface'

/**
 * > Registers the functions controller
 * @param app -> the fastify instance
 * @param functionsList -> the list of all functions
 * @param rulesList -> the list of all rules
 */
export const registerFunctions = async ({
  app,
  rulesList,
  functionsList
}: RegisterFunctionsParams) => {
  await app.register(functionsController, {
    functionsList,
    rules: rulesList,
    prefix: `${API_VERSION}/app/:appId/functions`
  })
}
