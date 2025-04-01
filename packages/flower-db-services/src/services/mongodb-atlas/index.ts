import { EventEmitterAsyncResourceOptions } from 'events'
import { Collection, Document, FindCursor } from 'mongodb'
import { checkValidation } from '../../utils/roles/machines'
import { getWinningRole } from '../../utils/roles/machines/utils'
import { expandQuery } from '../../utils/rules'
import { GetOperatorsFunction, MongodbAtlasFunction } from './model'
import { getFormattedQuery, getValidRule } from './utils'



//TODO aggiungere no-sql inject security
const getOperators: GetOperatorsFunction = (
  collection,
  { rules = {}, collName, user, run_as_system }
) => ({
  findOne: async (query) => {

    if (!run_as_system) {
      const { filters, roles } = rules[collName] || {}

      // PRE QUERY -> build the right filter
      const formattedQuery = getFormattedQuery(filters, query, user)

      // QUERY -> findOne document with the formatted Query
      const result = await collection.findOne({ $and: formattedQuery })

      // POST QUERY -> check the if the user can read the document
      const winningRole = getWinningRole(result, user, roles)
      const { status, document } = winningRole ? await checkValidation(winningRole, {
        type: "read",
        roles,
        cursor: result,
        expansions: {},
      }, user) : { status: true, document: result }

      return Promise.resolve(status ? document : {});
    }
    return collection.findOne(query)
  },
  deleteOne: async (query) => {
    if (!run_as_system) {
      const { roles } = rules[collName] || {}
      const currentRules = getValidRule({ filters: roles, user })
      const deleteForbidden = !!currentRules?.length && currentRules[0].delete === false
      if (deleteForbidden) {
        throw new Error('Delete not permitted')
      }
    }
    return collection.deleteOne(query)
  },
  insertOne: async (data) => {
    const { roles } = rules[collName] || {}
    if (!run_as_system) {
      const currentRules = getValidRule({
        filters: roles,
        user,
        record: { ...data, ...data.$set, ...data.$setOnInsert }
      })
      const insertForbidden = !!currentRules?.length && currentRules[0].insert === false
      if (insertForbidden) {
        throw new Error('Insert not permitted')
      }
    }
    return collection.insertOne(data)
  },
  updateOne: async (query, data) => {
    const { roles, filters } = rules[collName]
    const currentRules = getValidRule({
      filters: roles,
      user,
      record: { ...data, ...data.$set, ...data.$setOnInsert }
    })
    const updateForbidden = !!currentRules?.length && currentRules[0].write === false
    if (updateForbidden) {
      throw new Error('Update not permitted')
    }

    const preFilter = run_as_system ? undefined : getValidRule({ filters, user })
    const isValidPreFilter = !!preFilter?.length
    const formattedQuery = [
      isValidPreFilter && expandQuery(preFilter[0]?.query, { '%%user': user }),
      query
    ].filter(Boolean)

    // TODO -> fare filtro reale
    return collection.updateOne({ $and: formattedQuery }, data)
  },
  find: (query) => {
    const { filters, roles } = rules[collName] || {}
    const preFilter = run_as_system ? undefined : getValidRule({ filters, user })
    const isValidPreFilter = !!preFilter?.length
    const formattedQuery = [
      isValidPreFilter && expandQuery(preFilter[0].query, { '%%user': user }),
      query
    ].filter(Boolean)

    // QUERY -> find documents with the formatted Query
    const originalCursor = collection.find({ $and: formattedQuery })

    // CURSOR -> create a cloned cursor to manipulate the response
    const client = originalCursor[
      'client' as keyof typeof originalCursor
    ] as EventEmitterAsyncResourceOptions
    const newCursor = new FindCursor(client)

    newCursor.toArray = async () => {
      const response = await originalCursor.toArray()
      const filteredResponse = await Promise.all(response.map(async (currentDoc) => {
        const winningRole = getWinningRole(currentDoc, user, roles)
        // POST QUERY -> check the if the user can read the single document
        const { status, document } = winningRole ? await checkValidation(winningRole, {
          type: "read",
          roles,
          cursor: currentDoc,
          expansions: {},
        }, user) : { status: !roles.length, document: currentDoc }
        return status ? document : undefined
      }))
      return filteredResponse.filter(Boolean)

    }
    return newCursor
  },
  watch: async ( //TODO -> add filter & rules in watch
    pipeline?: Parameters<typeof collection.watch>[0],
    options?: Parameters<typeof collection.watch>[1]
  ) => collection.watch(pipeline, options)
})

const MongodbAtlas: MongodbAtlasFunction = (
  app,
  { rules, user, run_as_system } = {}
) => ({
  db: (dbName: string) => {
    return {
      collection: (collName: string) => {
        const collection: Collection<Document> = app.mongo.client
          .db(dbName)
          .collection(collName)
        return getOperators(collection, { rules, collName, user, run_as_system })
      }
    }
  }
})

export default MongodbAtlas
