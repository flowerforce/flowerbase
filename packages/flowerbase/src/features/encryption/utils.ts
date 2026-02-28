import path from "node:path"
import { readJsonContent, recursivelyCollectFiles } from "../../utils"
import { EncryptionSchemaFile, EncryptionSchemas } from "./interface"

/**
 * @experimental
 * Schemas used for Client-Side Level Encryption configuration.
 *
 * **Important:** These schemas do not perform JSON validation.
 */
export const loadEncryptionSchemas = async (rootDir = process.cwd()): Promise<EncryptionSchemas> => {
  const schemasRoot = path.join(rootDir, 'data_sources', 'mongodb-atlas')

  const files = recursivelyCollectFiles(schemasRoot)
  const schemaFiles = files.filter((x) => x.endsWith('encryption-schema.json'))

  return schemaFiles.reduce((acc, filePath) => {
    const { collection, database, schema } = readJsonContent(filePath) as EncryptionSchemaFile
    acc[`${database}.${collection}`] = schema
    return acc
  }, {} as EncryptionSchemas)
}
