import m from 'module'
import vm from 'vm'
import { EJSON } from 'bson'
import { generateContextData } from './helpers'
import { GenerateContextParams } from './interface'
import { createRequire } from 'node:module';

/**
 * > Used to generate the current context
 * @testable
 * @param args -> generic arguments
 * @param app -> the fastify instance
 * @param rules -> the rules object
 * @param user -> the current user
 * @param currentFunction -> the function's name that should be called
 * @param functionsList -> the list of all functions
 * @param services -> the list of all services
 */
export async function GenerateContext({
  args,
  app,
  rules,
  user,
  currentFunction,
  functionsList,
  services
}: GenerateContextParams) {
  const contextData = generateContextData({
    user,
    services,
    app,
    rules,
    currentFunction,
    functionsList,
    GenerateContext
  })

  try {
    const customRequire = createRequire(__dirname);
    vm.runInContext(m.wrap(currentFunction.code), vm.createContext(contextData))(
      exports,
      customRequire,
      module,
      __filename,
      __dirname
    )
  }
  catch (e) {
    console.log(e)
  }


  return await module.exports(...EJSON.deserialize(args))
}
