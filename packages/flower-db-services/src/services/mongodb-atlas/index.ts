import { EventEmitterAsyncResourceOptions } from 'events'
import { Collection, Document, EventsDescription, FindCursor } from 'mongodb'
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
  deleteOne: async (query = {}) => {
    if (!run_as_system) {
      const { roles } = rules[collName] || {}
      const result = await collection.findOne(query)
      const winningRole = getWinningRole(result, user, roles)
      const { status } = winningRole ? await checkValidation(winningRole, {
        type: "delete",
        roles,
        cursor: result,
        expansions: {},
      }, user) : { status: true }

      if (!status) {
        return Promise.resolve({
          acknowledged: false,
          deletedCount: 0
        })
      }
      return collection.deleteOne(query)
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
  watch: async (
    pipeline = [],
    options
  ) => {
    if (!run_as_system) {
      const { filters, roles } = rules[collName] || {}
      const formattedQuery = getFormattedQuery(filters, {}, user)
      const formattedPipeline = [{
        $match: {
          $and: formattedQuery
        }
      }, ...pipeline]

      const result = collection.watch(formattedPipeline, options)
      const originalOn = result.on.bind(result);

      const isValidChange = async ({ fullDocument, updateDescription }: Document) => {
        const winningRole = getWinningRole(fullDocument, user, roles)
        const { status, document } = winningRole ? await checkValidation(winningRole, {
          type: "read",
          roles,
          cursor: fullDocument,
          expansions: {},
        }, user) : { status: true, document: fullDocument }

        const { status: updatedFieldsStatus, document: updatedFields } = winningRole ? await checkValidation(winningRole, {
          type: "read",
          roles,
          cursor: updateDescription.updatedFields,
          expansions: {},
        }, user) : { status: true, document: updateDescription.updatedFields }
        return { status, document, updatedFieldsStatus, updatedFields }
      }

      result.on = <EventKey extends keyof EventsDescription>(eventType: EventKey, listener: EventsDescription[EventKey]) => {
        return originalOn(eventType, async (change: Document) => {
          const { status, document, updatedFieldsStatus, updatedFields } = await isValidChange(change)
          if (!status) return
          const filteredChange = { ...change, fullDocument: document, updateDescription: { ...change.updateDescription, updatedFields: updatedFieldsStatus ? updatedFields : {} } }
          listener(filteredChange)
        });
      }

      return result
    }
    return collection.watch(pipeline, options)
  },
  aggregate: ( //TODO -> add filter & rules in aggregate
    pipeline,
    options,
  ) => collection.aggregate(pipeline, options),
  insertMany: (documents, options) => collection.insertMany(documents, options), //TODO -> add filter & rules in insertMany
  updateMany: (filter, updates, options) => collection.updateMany(filter, updates, options) //TODO -> add filter & rules in updateMany

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
