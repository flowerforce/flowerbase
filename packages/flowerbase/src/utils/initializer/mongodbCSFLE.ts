import {
  ClientEncryption,
  MongoClient,
  UUID,
  Binary,
  type Document,
  type AWSEncryptionKeyOptions,
  type AWSKMSProviderConfiguration,
  type AzureEncryptionKeyOptions,
  type AzureKMSProviderConfiguration,
  type GCPKMSProviderConfiguration,
  type GCPEncryptionKeyOptions,
  type KMIPKMSProviderConfiguration,
  type KMIPEncryptionKeyOptions,
  type LocalKMSProviderConfiguration,
  type AutoEncryptionExtraOptions,
  type KMSProviders,
  type AutoEncryptionOptions,
} from "mongodb";
import { EncryptionSchemaProperty, MappedEncryptionSchema, MappedEncryptionSchemaProperty, type EncryptionSchemas } from "../../features/encryption/interface";
import { DEFAULT_CONFIG } from "../../constants";

type KMSProviderConfig =
  | {
    /**
     * The alias of the key. It must be referenced in the schema map
     * to select which key to use for encryption.
     */
    keyAlias: string
    /**
     * KMS Provider type.
     */
    type: "aws"
    /**
     * KMS Provider specific authorization configuration.
     */
    config: AWSKMSProviderConfiguration
    /**
     * Configuration of the master key.
     */
    masterKey: AWSEncryptionKeyOptions
  } | {
    keyAlias: string
    type: "azure"
    config: AzureKMSProviderConfiguration,
    masterKey: AzureEncryptionKeyOptions
  } | {
    keyAlias: string
    type: "gcp"
    config: GCPKMSProviderConfiguration,
    masterKey: GCPEncryptionKeyOptions
  } | {
    keyAlias: string
    type: "kmip"
    config: KMIPKMSProviderConfiguration,
    masterKey: KMIPEncryptionKeyOptions
  } | {
    keyAlias: string
    type: "local"
    config: LocalKMSProviderConfiguration,
  }

export type MongoDbEncryptionConfig = {
  kmsProviders: KMSProviderConfig[],
  /**
   * The Key Vault database name
   * @default encryption
   */
  keyVaultDb?: string
  /**
 * The Key Vault database collection
 * @default __keyVault
 */
  keyVaultCollection?: string
  extraOptions?: AutoEncryptionExtraOptions
}

/**
 * @internal
 */
type RequiredConfig = Required<Omit<MongoDbEncryptionConfig, "extraOptions">>

type DataKey = { dataKeyId: UUID, dataKeyAlias: string }

async function ensureUniqueKeyAltNameIndex(db: ReturnType<MongoClient['db']>, config: RequiredConfig): Promise<void> {
  await db.collection(config.keyVaultCollection).createIndex(
    { keyAltNames: 1 },
    {
      unique: true,
      partialFilterExpression: { keyAltNames: { $exists: true } },
    }
  );
}

/**
 * Ensure provided KMS Providers DEK keys exist in the key vault. If not, they are created.
 */
async function ensureDataEncryptionKeys(
  clientEncryption: ClientEncryption,
  keyVaultDb: ReturnType<MongoClient['db']>,
  config: RequiredConfig
): Promise<DataKey[]> {
  const keys: DataKey[] = []

  for (const kmsProvider of config.kmsProviders) {
    const existingKey = await keyVaultDb.collection(config.keyVaultCollection).findOne({
      keyAltNames: kmsProvider.keyAlias,
    });

    if (existingKey?._id instanceof Binary) {
      keys.push({ dataKeyId: existingKey._id, dataKeyAlias: kmsProvider.keyAlias })
      continue
    }

    const dataKeyId = await clientEncryption.createDataKey(kmsProvider.type, {
      masterKey: "masterKey" in kmsProvider ? kmsProvider.masterKey : undefined,
      keyAltNames: [kmsProvider.keyAlias],
    });
    console.log(`[MongoDB Encryption] Created new key with alias ${kmsProvider.keyAlias}`)
    keys.push({ dataKeyId, dataKeyAlias: kmsProvider.keyAlias })
  }

  return keys
}

/**
 * Recursively resolve key aliases in an encryption schema to their corresponding key IDs.
 */
const resolveKeyAliases = (schema: EncryptionSchemaProperty, dataKeys: DataKey[]): MappedEncryptionSchemaProperty => {
  if ("encrypt" in schema) {
    if (!schema.encrypt.keyAlias) {
      return schema
    }
    const keyId = dataKeys.find(k => k.dataKeyAlias === schema.encrypt.keyAlias)?.dataKeyId
    if (!keyId) {
      throw new Error(`Key with alias ${schema.encrypt.keyAlias} could not be found in the Key Vault.`)
    }
    return {
      encrypt: {
        bsonType: schema.encrypt.bsonType,
        algorithm: schema.encrypt.algorithm,
        keyId: [keyId]
      }
    }
  }
  const mappedSchema: MappedEncryptionSchema = {
    bsonType: "object",
    properties: Object.entries(schema.properties).reduce((acc, [property, config]) => {
      acc[property] = resolveKeyAliases(config, dataKeys)
      return acc
    }, {} as Record<string, MappedEncryptionSchemaProperty>)
  }

  if (schema.encryptMetadata) {
    const keyId = dataKeys.find(k => k.dataKeyAlias === schema.encryptMetadata!.keyAlias)?.dataKeyId
    if (!keyId) {
      throw new Error(`Key with alias ${schema.encryptMetadata.keyAlias} could not be found in the Key Vault.`)
    }
    mappedSchema.encryptMetadata = { keyId: [keyId] }
  }

  return mappedSchema
}

const buildSchemaMap = (schemas: EncryptionSchemas, dataKeys: DataKey[]) => {
  return Object.entries(schemas).reduce((acc, [key, schema]) => {
    acc[key] = resolveKeyAliases(schema, dataKeys)
    return acc
  }, {} as Record<string, Document>)
}

/**
 * MongoDB Client-Side Field Level Encryption (CSFLE).
 * Setup encryption and return a MongoDB client with CSFLE enabled.
 */
export const initMongoDBClientWithCSFLE = async (
  config: MongoDbEncryptionConfig & { mongodbUrl: string; schemas?: EncryptionSchemas }
): Promise<AutoEncryptionOptions> => {
  if (config.kmsProviders.length === 0) {
    throw new Error('At least one KMS Provider is required when using MongoDB encryption')
  }

  const requiredConfig: RequiredConfig = {
    kmsProviders: config.kmsProviders,
    keyVaultDb: config.keyVaultDb ?? DEFAULT_CONFIG.MONGODB_ENCRYPTION_CONFIG.keyVaultDb,
    keyVaultCollection: config.keyVaultDb ?? DEFAULT_CONFIG.MONGODB_ENCRYPTION_CONFIG.keyVaultCollection,
  }

  const kmsProviders = requiredConfig.kmsProviders.reduce(
    (acc, provider) => ({ ...acc, [provider.type]: provider.config }),
    {} as KMSProviders
  )

  const keyVaultNamespace = `${requiredConfig.keyVaultDb}.${requiredConfig.keyVaultCollection}`
  const keyVaultClient = new MongoClient(config.mongodbUrl, {
    autoEncryption: {
      keyVaultNamespace,
      kmsProviders,
      extraOptions: config.extraOptions
    }
  });

  await keyVaultClient.connect();

  const keyVaultDb = keyVaultClient.db(requiredConfig.keyVaultDb);
  await ensureUniqueKeyAltNameIndex(keyVaultDb, requiredConfig)

  const clientEncryption = new ClientEncryption(keyVaultClient, {
    keyVaultNamespace,
    kmsProviders,
  });

  const dataKeys = await ensureDataEncryptionKeys(clientEncryption, keyVaultDb, requiredConfig)

  /*   const encryptedClient = new MongoClient(config.mongodbUrl, {
      autoEncryption: {
        keyVaultNamespace,
        kmsProviders,
        schemaMap: config.schemas ? buildSchemaMap(config.schemas, dataKeys) : undefined,
        extraOptions: config.extraOptions
      },
    }); */

  await keyVaultClient.close()
  // return encryptedClient
  return {
    keyVaultNamespace,
    kmsProviders,
    schemaMap: config.schemas ? buildSchemaMap(config.schemas, dataKeys) : undefined,
    extraOptions: config.extraOptions
  }
}
