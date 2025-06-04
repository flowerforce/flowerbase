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
    host
})
