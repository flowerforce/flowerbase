import fs from 'fs'
import path from 'node:path'
import { Document } from 'mongodb'
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
  filter,
  projection,
  options,
  returnNewDocument,
  document,
  documents,
  pipeline,
  isClient = false
}: ExecuteQueryParams) => {
  const resolvedQuery =
    typeof query !== 'undefined'
      ? query
      : typeof filter !== 'undefined'
        ? filter
        : {}
  const resolvedUpdate = typeof update !== 'undefined' ? update : {}
  const resolvedOptions =
    typeof options !== 'undefined'
      ? options
      : typeof returnNewDocument === 'boolean'
        ? { returnDocument: returnNewDocument ? 'after' : 'before' }
        : undefined
  const parsedOptions = resolvedOptions ? EJSON.deserialize(resolvedOptions) : undefined
  const parsedProjection =
    typeof projection !== 'undefined' ? EJSON.deserialize(projection) : undefined
  const resolvedProjection =
    typeof projection !== 'undefined'
      ? parsedProjection
      : parsedOptions &&
          typeof parsedOptions === 'object' &&
          'projection' in parsedOptions
        ? (parsedOptions as Document).projection
        : undefined
  return {
    find: async () =>
      await (() => {
        const cursor = (currentMethod as ReturnType<GetOperatorsFunction>['find'])(
          EJSON.deserialize(resolvedQuery),
          resolvedProjection,
          parsedOptions
        )
        if (parsedOptions?.sort) {
          cursor.sort(parsedOptions.sort as Document)
        }
        if (typeof parsedOptions?.skip === 'number') {
          cursor.skip(parsedOptions.skip)
        }
        if (typeof parsedOptions?.limit === 'number') {
          cursor.limit(parsedOptions.limit)
        }
        return cursor.toArray()
      })(),
    findOne: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['findOne'])(
        EJSON.deserialize(resolvedQuery),
        resolvedProjection,
        parsedOptions
      ),
    count: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['count'])(
        EJSON.deserialize(resolvedQuery),
        parsedOptions
      ),
    countDocuments: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['countDocuments'])(
        EJSON.deserialize(resolvedQuery),
        parsedOptions
      ),
    deleteOne: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['deleteOne'])(
        EJSON.deserialize(resolvedQuery),
        parsedOptions
      ),
    insertOne: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['insertOne'])(
        EJSON.deserialize(document)
      ),
    updateOne: () => currentMethod(EJSON.deserialize(resolvedQuery), EJSON.deserialize(resolvedUpdate)),
    findOneAndUpdate: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['findOneAndUpdate'])(
        EJSON.deserialize(resolvedQuery),
        EJSON.deserialize(resolvedUpdate),
        parsedOptions
      ),
    aggregate: async () =>
      (await (currentMethod as ReturnType<GetOperatorsFunction>['aggregate'])(
        EJSON.deserialize(pipeline),
        {}, // TODO -> ADD OPTIONS
        isClient,
      )).toArray(),
    insertMany: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['insertMany'])(
        EJSON.deserialize(documents)
      ),
    updateMany: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['updateMany'])(
        EJSON.deserialize(resolvedQuery),
        EJSON.deserialize(resolvedUpdate)
      ),
    deleteMany: () =>
      (currentMethod as ReturnType<GetOperatorsFunction>['deleteMany'])(
        EJSON.deserialize(resolvedQuery),
        parsedOptions
      )
  }
}
