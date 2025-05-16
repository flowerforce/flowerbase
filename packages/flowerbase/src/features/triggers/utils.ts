import fs from 'fs'
import path from 'node:path'
import cron from 'node-cron'
import { AUTH_CONFIG } from '../../constants'
import { readJsonContent } from '../../utils'
import { GenerateContext } from '../../utils/context'
import { HandlerParams, Trigger, Triggers } from './interface'

/**
 * Loads trigger files from the specified directory and returns them as an array of objects.
 * Each object contains the file name and the parsed JSON content.
 *
 * @testable
 * @param {string} [rootDir=process.cwd()] - The root directory from which to load the triggers. Defaults to the current working directory.
 * @returns {Promise<Triggers>} A promise that resolves to an array of trigger objects.
 */
export const loadTriggers = async (rootDir = process.cwd()): Promise<Triggers> => {
  const triggersPath = path.join(rootDir, 'triggers')
  const files = fs.readdirSync(triggersPath)

  const triggers = files
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => ({
      fileName,
      content: readJsonContent(path.join(triggersPath, fileName)) as Trigger
    }))

  return triggers
}

/**
 * Handles the scheduling of a cron job and triggers the appropriate function.
 *
 * @testable
 * @param {Object} params - The parameters for the handler.
 * @param {Object} params.config - Configuration object for the cron trigger.
 * @param {string} params.config.schedule - Cron schedule string (e.g., "* * * * *" for every minute).
 * @param {Function} params.triggerHandler - The function to be triggered when the cron job executes.
 * @param {Array<Function>} params.functionsList - List of available functions.
 * @param {Object} params.services - Services available to the handler.
 * @param {Object} params.app - The app instance for context.
 */
const handleCronTrigger = async ({
  config,
  triggerHandler,
  functionsList,
  services,
  app
}: HandlerParams) => {
  cron.schedule(config.schedule, async () => {
    await GenerateContext({
      args: [],
      app,
      rules: {},
      user: {},
      currentFunction: triggerHandler,
      functionsList,
      services
    })
  })
}

const handleAuthenticationTrigger = async ({
  config,
  triggerHandler,
  functionsList,
  services,
  app
}: HandlerParams) => {
  const { database } = config
  const pipeline = [
    {
      $match: {
        operationType: { $in: ['INSERT'] }
      }
    }
  ]
  const changeStream = app.mongo.client
    .db(database)
    .collection(AUTH_CONFIG.authCollection)
    .watch(pipeline, {
      fullDocument: 'whenAvailable'
    })
  changeStream.on('change', async function (change) {
    const document = change['fullDocument' as keyof typeof change] as Record<
      string,
      string
    > //TODO -> define user type

    if (document) {
      delete document.password

      const currentUser = { ...document }
      delete currentUser.password
      await GenerateContext({
        args: [{ user: currentUser }],
        app,
        rules: {},
        user: {},
        currentFunction: triggerHandler,
        functionsList,
        services
      })
    }
  })
}

/**
 * Handles a database trigger by watching changes in a specified collection and triggering the appropriate handler.
 *
 * @testable
 * @param {Object} params - The parameters for the handler.
 * @param {Object} params.config - Configuration object for the database trigger.
 * @param {string} params.config.database - The name of the database to watch.
 * @param {string} params.config.collection - The name of the collection to watch.
 * @param {Array<string>} [params.config.operation_types=[]] - List of operation types to watch (e.g., "insert", "update").
 * @param {Object} [params.config.match={}] - Additional match criteria for the change stream.
 * @param {Object} [params.config.project={}] - Projection to apply to the change stream results.
 * @param {boolean} [params.config.full_document] - Whether to include the full document in the change stream results.
 * @param {boolean} [params.config.full_document_before_change] - Whether to include the full document before the change.
 * @param {Function} params.triggerHandler - The function to be triggered on database changes.
 * @param {Array<Function>} params.functionsList - List of available functions.
 * @param {Object} params.services - Services available to the handler.
 * @param {Object} params.app - The app instance for context.
 */
const handleDataBaseTrigger = async ({
  config,
  triggerHandler,
  functionsList,
  services,
  app
}: HandlerParams) => {
  const {
    database,
    collection: collectionName,
    operation_types = [],
    match = {},
    project = {}
  } = config

  const collection = app.mongo.client.db(database).collection(collectionName)
  const pipeline = [
    {
      $match: {
        operationType: { $in: operation_types.map((op: string) => op.toLowerCase()) },
        ...match
      }
    },
    Object.keys(project).length
      ? {
        $project: project
      }
      : undefined
  ].filter(Boolean) as Parameters<typeof collection.watch>[0]
  const changeStream = collection.watch(pipeline, {
    fullDocument: config.full_document ? 'whenAvailable' : undefined,
    fullDocumentBeforeChange: config.full_document_before_change
      ? 'whenAvailable'
      : undefined
  })
  changeStream.on('change', async function (change) {
    await GenerateContext({
      args: [change],
      app,
      rules: {},
      user: {},
      currentFunction: triggerHandler,
      functionsList,
      services
    })
  })
  // TODO -> gestire close dello stream
}

export const TRIGGER_HANDLERS = {
  SCHEDULED: handleCronTrigger,
  DATABASE: handleDataBaseTrigger,
  AUTHENTICATION: handleAuthenticationTrigger
}
