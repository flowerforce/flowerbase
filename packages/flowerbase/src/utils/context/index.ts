import { createRequire } from 'node:module'
import vm from 'vm'
import { EJSON } from 'bson'
import { generateContextData } from './helpers'
import { GenerateContextParams } from './interface'

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
  services,
  runAsSystem,
  deserializeArgs = true
}: GenerateContextParams) {
  const contextFunction = { run_as_system: runAsSystem, ...currentFunction }
  const contextData = generateContextData({
    user,
    services,
    app,
    rules,
    currentFunction: contextFunction,
    functionsList,
    GenerateContext,
    runAsSystem
  })

  try {
    const entryFile = require.main?.filename ?? process.cwd()
    const customRequire = createRequire(entryFile)

    vm.runInContext(
      contextFunction.code,
      vm.createContext({
        ...contextData,
        require: customRequire,
        exports,
        module,
        __filename: __filename,
        __dirname: __dirname
      })
    )
  } catch (e) {
    console.log(e)
  }

  if (deserializeArgs) {
    return await module.exports(...EJSON.deserialize(args))
  }

  return await module.exports(...args)
}
