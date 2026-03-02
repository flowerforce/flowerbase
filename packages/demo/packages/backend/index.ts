import { initialize } from '@flowerforce/flowerbase';

const projectId = process.env.PROJECT_ID ?? "my-project-id"
const port = process.env.PORT ? Number(process.env.PORT) : undefined
const mongodbUrl = process.env.DB_CONNECTION_STRING
const jwtSecret = process.env.APP_SECRET
const host = process.env.HOST

initialize({
    projectId,
    port,
    mongodbUrl,
    jwtSecret,
    host,
    mongodbEncryptionConfig: {
        // extraOptions: {
        //     cryptSharedLibPath: "__path_to_crypt_shared__"
        // },
        kmsProviders: [
            {
                provider: "aws",
                keyAlias: "prod-data-key",
                config: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
                },
                masterKey: {
                    key: "arn:aws:kms:eu-central-1:123456789:key/123456789",
                    region: "eu-central-1"
                }
            },
            {
                provider: "local",
                keyAlias: "dev-data-key",
                config: {
                    key: "DE1+JeO3S2BTXar3FScBFsSnuz1TjhppXfqi9IBNA2JmVJx9lkBtcDu13/uzzL78r16iVeKKKLgzfOrXLrU+OqfjbaqzugOSbF/1I1q8pZP29vMzl625Thb2s1QEgMlF"
                },
            }
        ]
    }
})
