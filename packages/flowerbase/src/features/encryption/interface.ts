import type { UUID } from "mongodb"

export type EncryptionSchemaProperty =
  | EncryptionSchema
  | {
    encrypt: {
      algorithm: string
      bsonType: string
      keyAlias?: string
    }
  }

export type EncryptionSchema = {
  bsonType: "object"
  properties: Record<string, EncryptionSchemaProperty>
  encryptMetadata?: {
    keyAlias: string
  },
}


export type MappedEncryptionSchemaProperty =
  | MappedEncryptionSchema
  | {
    encrypt: {
      algorithm: string
      bsonType: string
      keyId?: [UUID]
    }
  }

export type MappedEncryptionSchema = {
  bsonType: "object"
  properties: Record<string, MappedEncryptionSchemaProperty>
  encryptMetadata?: {
    keyId: [UUID]
  },
}

export type EncryptionSchemaFile = {
  database: string
  collection: string
  schema: EncryptionSchema
}

export type EncryptionSchemas = Record<string, EncryptionSchema>
