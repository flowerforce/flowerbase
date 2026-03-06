import { UUID } from 'mongodb'
import type { EncryptionSchemas } from '../../features/encryption/interface'
import { buildSchemaMap } from '../initializer/mongodbCSFLE'

describe('buildSchemaMap', () => {
  const genericSchemas: EncryptionSchemas = {
    'appDb.records': {
      bsonType: 'object',
      encryptMetadata: {
        keyAlias: 'root-key'
      },
      properties: {
        publicText: {
          encrypt: {
            bsonType: 'string',
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
          }
        },
        protectedText: {
          encrypt: {
            bsonType: 'string',
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
            keyAlias: 'root-key'
          }
        },
        nestedObject: {
          bsonType: 'object',
          encryptMetadata: { keyAlias: 'nested-key' },
          properties: {
            deepObject: {
              bsonType: 'object',
              properties: {
                deepSecret: {
                  encrypt: {
                    bsonType: 'string',
                    algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random',
                    keyAlias: 'deep-key'
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  it('resolves keyAlias to keyId for root and nested schemas', () => {
    const rootKeyId = new UUID()
    const nestedKeyId = new UUID()
    const deepKeyId = new UUID()

    const schemaMap = buildSchemaMap(genericSchemas, [
      { dataKeyAlias: 'root-key', dataKeyId: rootKeyId },
      { dataKeyAlias: 'nested-key', dataKeyId: nestedKeyId },
      { dataKeyAlias: 'deep-key', dataKeyId: deepKeyId }
    ])

    expect(schemaMap['appDb.records']).toEqual({
      bsonType: 'object',
      encryptMetadata: { keyId: [rootKeyId] },
      properties: {
        publicText: {
          encrypt: {
            bsonType: 'string',
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random'
          }
        },
        protectedText: {
          encrypt: {
            bsonType: 'string',
            algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic',
            keyId: [rootKeyId]
          }
        },
        nestedObject: {
          bsonType: 'object',
          encryptMetadata: { keyId: [nestedKeyId] },
          properties: {
            deepObject: {
              bsonType: 'object',
              properties: {
                deepSecret: {
                  encrypt: {
                    bsonType: 'string',
                    algorithm: 'AEAD_AES_256_CBC_HMAC_SHA_512-Random',
                    keyId: [deepKeyId]
                  }
                }
              }
            }
          }
        }
      }
    })
  })

  it('throws when nested keyAlias cannot be resolved', () => {
    const rootKeyId = new UUID()

    expect(() =>
      buildSchemaMap(genericSchemas, [{ dataKeyAlias: 'root-key', dataKeyId: rootKeyId }])
    ).toThrow('Key with alias deep-key could not be found in the Key Vault.')
  })
})
