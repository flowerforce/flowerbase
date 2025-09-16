import { EventEmitterAsyncResourceOptions } from 'events'
import isEqual from 'lodash/isEqual'
import { Collection, Document, EventsDescription, FindCursor, WithId } from 'mongodb'
import { checkValidation } from '../../utils/roles/machines'
import { getWinningRole } from '../../utils/roles/machines/utils'
import { CRUD_OPERATIONS, GetOperatorsFunction, MongodbAtlasFunction } from './model'
import {
  applyAccessControlToPipeline,
  checkDenyOperation,
  getFormattedProjection,
  getFormattedQuery,
  normalizeQuery
} from './utils'

//TODO aggiungere no-sql inject security
const getOperators: GetOperatorsFunction = (
  collection,
  { rules = {}, collName, user, run_as_system }
) => ({
  /**
   * Finds a single document in a MongoDB collection with optional role-based filtering and validation.
   *
   * @param {Filter<Document>} query - The MongoDB query used to match the document.
   * @returns {Promise<Document | {} | null>} A promise resolving to the document if found and permitted, an empty object if access is denied, or `null` if not found.
   *
   * @description
   * If `run_as_system` is enabled, the function behaves like a standard `collection.findOne(query)` with no access checks.
   * Otherwise:
   *  - Merges the provided query with any access control filters using `getFormattedQuery`.
   *  - Attempts to find the document using the formatted query.
   *  - Determines the user's role via `getWinningRole`.
   *  - Validates the result using `checkValidation` to ensure read permission.
   *  - If validation fails, returns an empty object; otherwise returns the validated document.
   */
  findOne: async (query) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.READ)
      const { filters, roles } = rules[collName] || {}

      // Apply access control filters to the query
      const formattedQuery = getFormattedQuery(filters, query, user)

      const result = await collection.findOne({ $and: formattedQuery })

      const winningRole = getWinningRole(result, user, roles)

      const { status, document } = winningRole
        ? await checkValidation(
          winningRole,
          {
            type: 'read',
            roles,
            cursor: result,
            expansions: {}
          },
          user
        )
        : { status: true, document: result }

      // Return validated document or empty object if not permitted
      return Promise.resolve(status ? document : {})
    }
    // System mode: no validation applied
    return collection.findOne(query)
  },
  /**
   * Deletes a single document from a MongoDB collection with optional role-based validation.
   *
   * @param {Filter<Document>} [query={}] - The MongoDB query used to match the document to delete.
   * @returns {Promise<DeleteResult>} A promise resolving to the result of the delete operation.
   *
   * @throws {Error} If the user is not authorized to delete the document.
   *
   * @description
   * If `run_as_system` is enabled, the function deletes the document directly using `collection.deleteOne(query)`.
   * Otherwise:
   *  - Applies role-based and custom filters to the query using `getFormattedQuery`.
   *  - Retrieves the document using `findOne` to validate user permissions.
   *  - Checks if the user has the appropriate role to perform a delete via `checkValidation`.
   *  - If validation fails, throws an error.
   *  - If validation passes, deletes the document using the filtered query.
   */
  deleteOne: async (query = {}) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.DELETE)
      const { filters, roles } = rules[collName] || {}

      // Apply access control filters
      const formattedQuery = getFormattedQuery(filters, query, user)

      // Retrieve the document to check permissions before deleting
      const result = await collection.findOne({ $and: formattedQuery })
      const winningRole = getWinningRole(result, user, roles)

      const { status } = winningRole
        ? await checkValidation(
          winningRole,
          {
            type: 'delete',
            roles,
            cursor: result,
            expansions: {}
          },
          user
        )
        : { status: true }

      if (!status) {
        throw new Error('Delete not permitted')
      }

      return collection.deleteOne({ $and: formattedQuery })
    }
    // System mode: bypass access control
    return collection.deleteOne(query)
  },
  /**
   * Inserts a single document into a MongoDB collection with optional role-based validation.
   *
   * @param {OptionalId<Document>} data - The document to insert.
   * @param {InsertOneOptions} [options] - Optional settings for the insert operation, such as `writeConcern`.
   * @returns {Promise<InsertOneResult<Document>>} A promise resolving to the result of the insert operation.
   *
   * @throws {Error} If the user is not authorized to insert the document.
   *
   * @description
   * If `run_as_system` is enabled, the document is inserted directly without any validation.
   * Otherwise:
   *  - Determines the appropriate user role using `getWinningRole`.
   *  - Validates the insert operation using `checkValidation`.
   *  - If validation fails, an error is thrown.
   *  - If validation passes, the document is inserted.
   *
   * This ensures that only users with the correct permissions can insert data into the collection.
   */
  insertOne: async (data, options) => {
    const { roles } = rules[collName] || {}

    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.CREATE)
      const winningRole = getWinningRole(data, user, roles)

      const { status, document } = winningRole
        ? await checkValidation(
          winningRole,
          {
            type: 'insert',
            roles,
            cursor: data,
            expansions: {}
          },
          user
        )
        : { status: true, document: data }

      if (!status || !isEqual(data, document)) {
        throw new Error('Insert not permitted')
      }
      return collection.insertOne(data, options)
    }
    // System mode: insert without validation
    return collection.insertOne(data, options)
  },
  /**
   * Updates a single document in a MongoDB collection with optional role-based validation.
   *
   * @param {Filter<Document>} query - The MongoDB query used to match the document to update.
   * @param {UpdateFilter<Document> | Partial<Document>} data - The update operations or replacement document.
   * @param {UpdateOptions} [options] - Optional settings for the update operation.
   * @returns {Promise<UpdateResult>} A promise resolving to the result of the update operation.
   *
   * @throws {Error} If the user is not authorized to update the document.
   *
   * @description
   * If `run_as_system` is enabled, the function directly updates the document using `collection.updateOne(query, data, options)`.
   * Otherwise, it follows these steps:
   *  - Applies access control filters to the query using `getFormattedQuery`.
   *  - Retrieves the document using `findOne` to check if it exists and whether the user has permission to modify it.
   *  - Determines the user's role via `getWinningRole`.
   *  - Flattens update operators (`$set`, `$inc`, etc.) if present to extract the final modified fields.
   *  - Validates the update data using `checkValidation` to ensure compliance with role-based rules.
   *  - Ensures that no unauthorized modifications occur by comparing the validated document with the intended changes.
   *  - If validation fails, throws an error; otherwise, updates the document.
   */
  updateOne: async (query, data, options) => {
    if (!run_as_system) {

      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.UPDATE)
      const { filters, roles } = rules[collName] || {}
      // Apply access control filters

      // Normalize _id
      const formattedQuery = getFormattedQuery(filters, query, user)
      const safeQuery = Array.isArray(formattedQuery)
        ? normalizeQuery(formattedQuery)
        : formattedQuery

      const result = await collection.findOne({ $and: safeQuery })

      if (!result) {
        throw new Error('Update not permitted')
      }

      const winningRole = getWinningRole(result, user, roles)

      // Check if the update data contains MongoDB update operators (e.g., $set, $inc)
      const hasOperators = Object.keys(data).some((key) => key.startsWith('$'))

      // Flatten the update object to extract the actual fields being modified
      // const docToCheck = hasOperators
      //   ? Object.values(data).reduce((acc, operation) => ({ ...acc, ...operation }), {})
      //   : data
      const [matchQuery] = formattedQuery;  // TODO da chiedere/capire perchè è solo uno. tutti gli altri { $match: { $and: formattedQuery } }
      const pipeline = [
        {
          $match: matchQuery
        },
        {
          $limit: 1
        },
        ...Object.entries(data).map(([key, value]) => ({ [key]: value }))
      ]
      const [docToCheck] = hasOperators
        ? await collection.aggregate(pipeline).toArray()
        : ([data] as [Document])
      // Validate update permissions
      const { status, document } = winningRole
        ? await checkValidation(
          winningRole,
          {
            type: 'write',
            roles,
            cursor: docToCheck,
            expansions: {}
          },
          user
        )
        : { status: true, document: docToCheck }
      // Ensure no unauthorized changes are made
      const areDocumentsEqual = isEqual(document, docToCheck)

      if (!status || !areDocumentsEqual) {
        throw new Error('Update not permitted')
      }
      return collection.updateOne({ $and: formattedQuery }, data, options)
    }
    return collection.updateOne(query, data, options)
  },
  /**
   * Finds documents in a MongoDB collection with optional role-based access control and post-query validation.
   *
   * @param {Filter<Document>} query - The MongoDB query to filter documents.
   * @returns {FindCursor} A customized `FindCursor` that includes additional access control logic in its `toArray()` method.
   *
   * @description
   * If `run_as_system` is enabled, the function simply returns a regular MongoDB cursor (`collection.find(query)`).
   * Otherwise:
   *  - Combines the user query with role-based filters via `getFormattedQuery`.
   *  - Executes the query using `collection.find` with a `$and` of all filters.
   *  - Returns a cloned `FindCursor` where `toArray()`:
   *    - Applies additional post-query validation using `checkValidation` for each document.
   *    - Filters out documents the current user is not authorized to read.
   *
   * This ensures that both pre-query filtering and post-query validation are applied consistently.
   */
  find: (query) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.READ)
      const { filters, roles } = rules[collName] || {}

      // Pre-query filtering based on access control rules
      const formattedQuery = getFormattedQuery(filters, query, user)
      const currentQuery = formattedQuery.length ? { $and: formattedQuery } : {}
      // aggiunto filter per evitare questo errore: $and argument's entries must be objects
      const originalCursor = collection.find(currentQuery)
      // Clone the cursor to override `toArray` with post-query validation
      const client = originalCursor[
        'client' as keyof typeof originalCursor
      ] as EventEmitterAsyncResourceOptions
      const newCursor = new FindCursor(client)

      /**
       * Overridden `toArray` method that validates each document for read access.
       *
       * @returns {Promise<Document[]>} An array of documents the user is authorized to read.
       */
      newCursor.toArray = async () => {
        const response = await originalCursor.toArray()

        const filteredResponse = await Promise.all(
          response.map(async (currentDoc) => {
            const winningRole = getWinningRole(currentDoc, user, roles)

            const { status, document } = winningRole
              ? await checkValidation(
                winningRole,
                {
                  type: 'read',
                  roles,
                  cursor: currentDoc,
                  expansions: {}
                },
                user
              )
              : { status: !roles.length, document: currentDoc }

            return status ? document : undefined
          })
        )

        return filteredResponse.filter(Boolean)
      }

      return newCursor
    }
    // System mode: return original unfiltered cursor
    return collection.find(query)
  },
  /**
   * Watches changes on a MongoDB collection with optional role-based filtering of change events.
   *
   * @param {Document[]} [pipeline=[]] - Optional aggregation pipeline stages to apply to the change stream.
   * @param {ChangeStreamOptions} [options] - Optional settings for the change stream, such as `fullDocument`, `resumeAfter`, etc.
   * @returns {ChangeStream} A MongoDB `ChangeStream` instance, optionally enhanced with access control.
   *
   * @description
   * If `run_as_system` is enabled, this function simply returns `collection.watch(pipeline, options)`.
   * Otherwise:
   *  - Applies access control filters via `getFormattedQuery`.
   *  - Prepends a `$match` stage to the pipeline to limit watched changes to authorized documents.
   *  - Overrides the `.on()` method of the returned `ChangeStream` to:
   *    - Validate the `fullDocument` and any `updatedFields` using `checkValidation`.
   *    - Filter out change events the user is not authorized to see.
   *    - Pass only validated and filtered events to the original listener.
   *
   * This allows fine-grained control over what change events a user can observe, based on roles and filters.
   */
  watch: (pipeline = [], options) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.READ)
      const { filters, roles } = rules[collName] || {}

      // Apply access filters to initial change stream pipeline
      const formattedQuery = getFormattedQuery(filters, {}, user)
      const formattedPipeline = [
        {
          $match: {
            $and: formattedQuery
          }
        },
        ...pipeline
      ]

      const result = collection.watch(formattedPipeline, options)
      const originalOn = result.on.bind(result)

      /**
       * Validates a change event against the user's roles.
       *
       * @param {Document} change - A change event from the ChangeStream.
       * @returns {Promise<{ status: boolean, document: Document, updatedFieldsStatus: boolean, updatedFields: Document }>}
       */
      const isValidChange = async ({ fullDocument, updateDescription }: Document) => {
        const winningRole = getWinningRole(fullDocument, user, roles)

        const { status, document } = winningRole
          ? await checkValidation(
            winningRole,
            {
              type: 'read',
              roles,
              cursor: fullDocument,
              expansions: {}
            },
            user
          )
          : { status: true, document: fullDocument }

        const { status: updatedFieldsStatus, document: updatedFields } = winningRole
          ? await checkValidation(
            winningRole,
            {
              type: 'read',
              roles,
              cursor: updateDescription?.updatedFields,
              expansions: {}
            },
            user
          )
          : { status: true, document: updateDescription?.updatedFields }

        return { status, document, updatedFieldsStatus, updatedFields }
      }

      // Override the .on() method to apply validation before emitting events
      result.on = <EventKey extends keyof EventsDescription>(
        eventType: EventKey,
        listener: EventsDescription[EventKey]
      ) => {
        return originalOn(eventType, async (change: Document) => {
          const { status, document, updatedFieldsStatus, updatedFields } =
            await isValidChange(change)
          if (!status) return

          const filteredChange = {
            ...change,
            fullDocument: document,
            updateDescription: {
              ...change.updateDescription,
              updatedFields: updatedFieldsStatus ? updatedFields : {}
            }
          }

          listener(filteredChange)
        })
      }

      return result
    }

    // System mode: no filtering applied
    return collection.watch(pipeline, options)
  },
  //TODO -> add filter & rules in aggregate
  aggregate: async (pipeline = [], options, isClient) => {
    if (isClient) {
      throw new Error("Aggregate operator from cliente is not implemented! Move it to a function")
    }
    if (run_as_system) {
      return collection.aggregate(pipeline, options)
    }
    checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.READ)

    const { filters = [], roles = [] } = rules[collection.collectionName] || {}
    const formattedQuery = getFormattedQuery(filters, {}, user)
    const projection = getFormattedProjection(filters)

    const guardedPipeline = [
      ...(formattedQuery.length ? [{ $match: { $and: formattedQuery } }] : []),
      ...(projection ? [{ $project: projection }] : []),
      ...applyAccessControlToPipeline(pipeline, rules, user)
    ]

    // const pipelineCollections = getCollectionsFromPipeline(pipeline)

    // console.log(pipelineCollections)

    // pipelineCollections.every((collection) => checkDenyOperation(rules, collection, CRUD_OPERATIONS.READ))

    const originalCursor = collection.aggregate(guardedPipeline, options)
    const newCursor = Object.create(originalCursor)

    newCursor.toArray = async () => {
      const results = await originalCursor.toArray()

      const filtered = await Promise.all(
        results.map(async (doc) => {
          const role = getWinningRole(doc, user, roles)
          const { status, document } = role
            ? await checkValidation(
              role,
              { type: 'read', roles, cursor: doc, expansions: {} },
              user
            )
            : { status: !roles?.length, document: doc }
          return status ? document : undefined
        })
      )

      return filtered.filter(Boolean)
    }

    return newCursor
  },
  /**
   * Inserts multiple documents into a MongoDB collection with optional role-based access control and validation.
   *
   * @param {OptionalId<Document>[]} documents - The array of documents to insert.
   * @param {BulkWriteOptions} [options] - Optional settings passed to `insertMany`, such as `ordered`, `writeConcern`, etc.
   * @returns {Promise<InsertManyResult<Document>>} A promise resolving to the result of the insert operation.
   *
   * @throws {Error} If no documents pass validation or user is not permitted to insert.
   *
   * @description
   * If `run_as_system` is enabled, this function directly inserts the documents without validation.
   * Otherwise, for each document:
   *  - Finds the user's applicable role using `getWinningRole`.
   *  - Validates the insert operation through `checkValidation`.
   *  - Filters out any documents the user is not authorized to insert.
   * Only documents passing validation will be inserted.
   */
  insertMany: async (documents, options) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.CREATE)
      const { roles } = rules[collName] || {}
      // Validate each document against user's roles
      const filteredItems = await Promise.all(
        documents.map(async (currentDoc) => {
          const winningRole = getWinningRole(currentDoc, user, roles)

          const { status, document } = winningRole
            ? await checkValidation(
              winningRole,
              {
                type: 'insert',
                roles,
                cursor: currentDoc,
                expansions: {}
              },
              user
            )
            : { status: !roles.length, document: currentDoc }

          return status ? document : undefined
        })
      )

      const canInsert = isEqual(filteredItems, documents)

      if (!canInsert) {
        throw new Error('Insert not permitted')
      }

      return collection.insertMany(documents, options)
    }
    // If system mode is active, insert all documents without validation
    return collection.insertMany(documents, options)
  },
  updateMany: async (query, data, options) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.UPDATE)
      const { filters, roles } = rules[collName] || {}
      // Apply access control filters
      const formattedQuery = getFormattedQuery(filters, query, user)

      // Retrieve the document to check permissions before updating
      const result = await collection.find({ $and: formattedQuery }).toArray()
      if (!result) {
        console.log('check1 In updateMany --> (!result)')
        throw new Error('Update not permitted')
      }

      // Check if the update data contains MongoDB update operators (e.g., $set, $inc)
      const hasOperators = Object.keys(data).some((key) => key.startsWith('$'))

      // Flatten the update object to extract the actual fields being modified
      // const docToCheck = hasOperators
      //   ? Object.values(data).reduce((acc, operation) => ({ ...acc, ...operation }), {})
      //   : data

      const pipeline = [
        {
          $match: { $and: formattedQuery }
        },
        ...Object.entries(data).map(([key, value]) => ({ [key]: value }))
      ]

      const docsToCheck = hasOperators
        ? await collection.aggregate(pipeline).toArray()
        : result

      const filteredItems = await Promise.all(
        docsToCheck.map(async (currentDoc) => {
          const winningRole = getWinningRole(currentDoc, user, roles)

          const { status, document } = winningRole
            ? await checkValidation(
              winningRole,
              {
                type: 'write',
                roles,
                cursor: currentDoc,
                expansions: {}
              },
              user
            )
            : { status: !roles.length, document: currentDoc }

          return status ? document : undefined
        })
      )

      // Ensure no unauthorized changes are made
      const areDocumentsEqual = isEqual(docsToCheck, filteredItems)

      if (!areDocumentsEqual) {
        console.log('check1 In updateMany --> (!areDocumentsEqual)')

        throw new Error('Update not permitted')
      }

      return collection.updateMany({ $and: formattedQuery }, data, options)
    }
    return collection.updateMany(query, data, options)
  },
  /**
   * Deletes multiple documents from a MongoDB collection with role-based access control and validation.
   *
   * @param query - The initial MongoDB query to filter documents to be deleted.
   * @returns {Promise<{ acknowledged: boolean, deletedCount: number }>} A promise resolving to the deletion result.
   *
   * @description
   * If `run_as_system` is enabled, this function directly deletes documents matching the given query.
   * Otherwise, it:
   *  - Applies additional filters from access control rules.
   *  - Fetches matching documents.
   *  - Validates each document against user roles.
   *  - Deletes only the documents that the current user has permission to delete.
   */
  deleteMany: async (query = {}) => {
    if (!run_as_system) {
      checkDenyOperation(rules, collection.collectionName, CRUD_OPERATIONS.DELETE)
      const { filters, roles } = rules[collName] || {}

      // Apply access control filters
      const formattedQuery = getFormattedQuery(filters, query, user)

      // Fetch documents matching the combined filters
      const data = await collection.find({ $and: formattedQuery }).toArray()

      // Filter and validate each document based on user's roles
      const filteredItems = await Promise.all(
        data.map(async (currentDoc) => {
          const winningRole = getWinningRole(currentDoc, user, roles)

          const { status, document } = winningRole
            ? await checkValidation(
              winningRole,
              {
                type: 'delete',
                roles,
                cursor: currentDoc,
                expansions: {}
              },
              user
            )
            : { status: !roles.length, document: currentDoc }

          return status ? document : undefined
        })
      )

      // Extract IDs of documents that passed validation
      const elementsToDelete = (filteredItems.filter(Boolean) as WithId<Document>[]).map(
        ({ _id }) => _id
      )

      if (!elementsToDelete.length) {
        return Promise.resolve({
          acknowledged: true,
          deletedCount: 0
        })
      }
      // Build final delete query with access control and ID filter
      const deleteQuery = {
        $and: [...formattedQuery, { _id: { $in: elementsToDelete } }]
      }
      return collection.deleteMany(deleteQuery)
    }
    // If running as system, bypass access control and delete directly
    return collection.deleteMany(query)
  }
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
        return getOperators(collection, {
          rules,
          collName,
          user,
          run_as_system
        })
      }
    }
  }
})

export default MongodbAtlas
