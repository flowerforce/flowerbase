import fs from 'fs'
import path from 'node:path'
import { EJSON } from 'bson'
import { GetOperatorsFunction } from '../../services/mongodb-atlas/model'
import { ExecuteQueryParams, Functions } from './interface'

/**
 * > Loads the functions config json file
 * @testable
 */
export const loadFunctions = async (rootDir = process.cwd()): Promise<Functions> => {
  const fnDir = 'functions'
  const configFile = path.join(rootDir, fnDir, 'config.json')
  const config = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as {
    name: string
  }[]

  const functions = config.reduce((acc, { name, ...opts }) => {
    const extensions = ['.js', '.ts']
    let code = ''
    const fnPath = extensions
      .map((ext) => path.join(rootDir, fnDir, `${name}${ext}`))
      .find(fs.existsSync)

    if (!fnPath) {
      throw new Error(`File ${name}.js or ${name}.ts not found`)
    }
    code = fs.readFileSync(fnPath, 'utf-8')
    acc[name] = { code, ...opts }

    return acc
  }, {} as Functions)

  return functions
}

/**
 * > Executes a single query
 * @param currentMethod -> the method that should be called
 * @param query -> the query data
 * @param update -> the update Document that should be deserialized
 */
export const executeQuery = async ({
  currentMethod,
  query,
  update,
  document
}: ExecuteQueryParams) => {
  return {
    find: async () =>
      await (currentMethod as ReturnType<GetOperatorsFunction>['find'])(
        EJSON.deserialize(query)
      ).toArray(),
    findOne: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['findOne'])(
        EJSON.deserialize(query)
      ),
    deleteOne: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['deleteOne'])(
        EJSON.deserialize(query)
      ),
    insertOne: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['insertOne'])(
        EJSON.deserialize(document)
      ),
    updateOne: () => currentMethod(EJSON.deserialize(query), EJSON.deserialize(update)),
    aggregate: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['aggregate'])(
        EJSON.deserialize(query)
      ),
    insertMany: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['insertMany'])(
        EJSON.deserialize(query)
      ),
    updateMany: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['updateMany'])(
        EJSON.deserialize(query),
        EJSON.deserialize(update)
      )
  }
}
