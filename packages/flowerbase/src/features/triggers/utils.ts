import fs from 'fs'
import path from 'node:path'
import cron from 'node-cron'
import { AUTH_CONFIG, DB_NAME } from '../../constants'
import { StateManager } from '../../state'
import { readJsonContent } from '../../utils'
import { GenerateContext } from '../../utils/context'
import { HandlerParams, Trigger, Triggers } from './interface'

const registerOnClose = (
  app: HandlerParams['app'],
  handler: () => Promise<void> | void,
  label: string
) => {
  if (app.server) {
    app.server.once('close', () => {
      Promise.resolve(handler()).catch((error) => {
        console.error(`${label} close error`, error)
      })
    })
    return
  }

  try {
    app.addHook('onClose', async () => {
      try {
        await handler()
      } catch (error) {
        console.error(`${label} close error`, error)
      }
    })
  } catch (error) {
    console.error(`${label} hook registration error`, error)
  }
}

const shouldIgnoreStreamError = (error: unknown) => {
  const err = error as { name?: string; message?: string }
  if (err?.name === 'MongoClientClosedError') return true
  if (err?.message?.includes('client was closed')) return true
  if (err?.message?.includes('Client is closed')) return true
  return false
}

/**
 * Loads trigger files from the specified directory and returns them as an array of objects.
 * Each object contains the file name and the parsed JSON content.
 *
 * @testable
 * @param {string} [rootDir=process.cwd()] - The root directory from which to load the triggers. Defaults to the current working directory.
 * @returns {Promise<Triggers>} A promise that resolves to an array of trigger objects.
 */
export const loadTriggers = async (rootDir = process.cwd()): Promise<Triggers> => {
  try {
    const triggersPath = path.join(rootDir, 'triggers')
    const files = fs.readdirSync(triggersPath)

    const triggers = files
      .filter((fileName) => fileName.endsWith('.json'))
      .map((fileName) => ({
        fileName,
        content: readJsonContent(path.join(triggersPath, fileName)) as Trigger
      }))

    return triggers
  } catch (e: unknown) {
    console.log("TRIGGERS NOT FOUND ->", (e as { message: string }).message)
    return []
  }

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
  const task = cron.schedule(config.schedule, async () => {
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
  registerOnClose(app, () => task.stop(), 'Scheduled trigger')
}

const mapOpInverse = {
  CREATE: ['insert', 'update', 'replace'],
  DELETE: ['delete'],
  LOGOUT: ['update'],
}

const handleAuthenticationTrigger = async ({
  config,
  triggerHandler,
  functionsList,
  services,
  app
}: HandlerParams) => {
  const { database, isAutoTrigger, operation_types, operation_type } = config
  const authCollection = AUTH_CONFIG.authCollection ?? 'auth_users'
  const collection = app.mongo.client.db(database || DB_NAME).collection(authCollection)
  const pipeline = [
    {
      $match: {
        operationType: {
          $in: operation_type
            ? mapOpInverse[operation_type]
            : operation_types
        }
      }
    }
  ]
  const changeStream = collection.watch(pipeline, {
    fullDocument: 'whenAvailable',
    fullDocumentBeforeChange: config.full_document_before_change
      ? 'whenAvailable'
      : undefined
  })
  changeStream.on('error', (error) => {
    if (shouldIgnoreStreamError(error)) return
    console.error('Authentication trigger change stream error', error)
  })
  changeStream.on('change', async function (change) {
    const operationType = change['operationType' as keyof typeof change] as
      | 'insert'
      | 'update'
      | 'replace'
      | 'delete'
    const documentKey = change['documentKey' as keyof typeof change] as
      | { _id?: unknown }
      | undefined
    const fullDocument = change['fullDocument' as keyof typeof change] as
      | Record<string, unknown>
      | null
    const fullDocumentBeforeChange = change['fullDocumentBeforeChange' as keyof typeof change] as
      | Record<string, unknown>
      | null
    if (!documentKey?._id) {
      return
    }

    const updateDescription = change[
      'updateDescription' as keyof typeof change
    ] as { updatedFields?: Record<string, unknown> } | undefined
    const updatedFields = updateDescription?.updatedFields
    const updatedStatus = updatedFields?.status
    const isInsert = operationType === 'insert'
    const isUpdate = operationType === 'update'
    const isReplace = operationType === 'replace'
    const isDelete = operationType === 'delete'
    const isLogoutUpdate = isUpdate && !!updatedFields && 'lastLogoutAt' in updatedFields

    let confirmedCandidate = false
    let confirmedDocument =
      fullDocument as Record<string, unknown> | null

    const buildUserData = (document: Record<string, unknown> | null) => {
      if (!document) {
        const id = documentKey?._id
        if (!id) return null
        const idString = typeof id === 'string'
          ? id
          : (id as { toString?: () => string }).toString?.() ?? String(id)
        return {
          id: idString,
          data: {
            _id: idString
          }
        }
      }

      const currentUser = { ...document }
      delete (currentUser as { password?: unknown }).password

      return {
        ...currentUser,
        id: (currentUser as { _id: { toString: () => string } })._id.toString(),
        data: {
          _id: (currentUser as { _id: { toString: () => string } })._id.toString(),
          email: (currentUser as { email?: string }).email
        }
      }
    }

    if (operation_type === 'LOGOUT') {
      if (!isLogoutUpdate) {
        return
      }
      const userData = buildUserData(fullDocument ?? confirmedDocument)
      if (!userData) {
        return
      }
      const op = {
        operationType: 'LOGOUT',
        fullDocument,
        fullDocumentBeforeChange,
        documentKey,
        updateDescription
      }
      try {
        await GenerateContext({
          args: [{ user: userData, ...op }],
          app,
          rules: StateManager.select("rules"),
          user: {},  // TODO from currentUser ??
          currentFunction: triggerHandler,
          functionsList,
          services,
          runAsSystem: true
        })
      } catch (error) {
        console.log("🚀 ~ handleAuthenticationTrigger ~ error:", error)
      }
      return
    }

    if (isDelete) {
      if (isAutoTrigger || operation_type !== 'DELETE') {
        return
      }
      const userData = buildUserData(fullDocumentBeforeChange ?? confirmedDocument)
      if (!userData) {
        return
      }
      const op = {
        operationType: 'DELETE',
        fullDocument,
        fullDocumentBeforeChange,
        documentKey,
        updateDescription
      }
      try {
        await GenerateContext({
          args: isAutoTrigger ? [userData] : [{ user: userData, ...op }],
          app,
          rules: StateManager.select("rules"),
          user: {},  // TODO from currentUser ??
          currentFunction: triggerHandler,
          functionsList,
          services,
          runAsSystem: true
        })
      } catch (error) {
        console.log("🚀 ~ handleAuthenticationTrigger ~ error:", error)
      }
      return
    }

    if (isReplace) {
      const userData = buildUserData(confirmedDocument)
      if (!userData) {
        return
      }
      const op = {
        operationType: 'UPDATE',
        fullDocument,
        fullDocumentBeforeChange,
        documentKey,
        updateDescription
      }
      try {
        await GenerateContext({
          args: isAutoTrigger ? [userData] : [{ user: userData, ...op }],
          app,
          rules: StateManager.select("rules"),
          user: {},  // TODO from currentUser ??
          currentFunction: triggerHandler,
          functionsList,
          services,
          runAsSystem: true
        })
      } catch (error) {
        console.log("🚀 ~ handleAuthenticationTrigger ~ error:", error)
      }
      return
    }

    if (!isInsert && !isUpdate) {
      return
    }

    if (isUpdate) {
      confirmedCandidate = updatedStatus === 'confirmed'
      if (confirmedCandidate && !confirmedDocument) {
        const fetched = await collection.findOne({
          _id: documentKey._id
        }) as Record<string, unknown> | null
        confirmedDocument = fetched ?? confirmedDocument
      }
    } else {
      confirmedCandidate = (confirmedDocument as { status?: string } | null)?.status === 'confirmed'
    }

    if (!confirmedCandidate) {
      return
    }

    const updateResult = await collection.findOneAndUpdate(
      {
        _id: documentKey._id,
        status: 'confirmed',
        on_user_creation_triggered_at: { $exists: false }
      },
      {
        $set: {
          on_user_creation_triggered_at: new Date()
        }
      },
      {
        returnDocument: 'after'
      }
    )

    const document =
      (updateResult?.value as Record<string, unknown> | null) ?? confirmedDocument
    if (!document) {
      return
    }

    delete (document as { password?: unknown }).password

    const userData = buildUserData(document)
    if (!userData) {
      return
    }

    const op = {
      operationType: 'CREATE',
      fullDocument,
      fullDocumentBeforeChange,
      documentKey,
      updateDescription
    }

    try {
      await GenerateContext({
        args: isAutoTrigger ? [userData] : [{ user: userData, ...op }],
        app,
        rules: StateManager.select("rules"),
        user: {},  // TODO from currentUser ??
        currentFunction: triggerHandler,
        functionsList,
        services,
        runAsSystem: true
      })
    } catch (error) {
      console.log("🚀 ~ handleAuthenticationTrigger ~ error:", error)
    }
  })
  registerOnClose(
    app,
    async () => {
      await changeStream.close()
    },
    'Authentication trigger'
  )
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
  changeStream.on('error', (error) => {
    if (shouldIgnoreStreamError(error)) return
    console.error('Database trigger change stream error', error)
  })
  changeStream.on('change', async function ({ clusterTime, ...change }) {
    await GenerateContext({
      args: [change],
      app,
      rules: StateManager.select("rules"),
      user: {}, // TODO add from? 
      currentFunction: triggerHandler,
      functionsList,
      services
    })
  })
  registerOnClose(
    app,
    async () => {
      await changeStream.close()
    },
    'Database trigger'
  )
}

export const TRIGGER_HANDLERS = {
  SCHEDULED: handleCronTrigger,
  DATABASE: handleDataBaseTrigger,
  AUTHENTICATION: handleAuthenticationTrigger
}
