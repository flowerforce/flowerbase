import { initialize } from '@flowerforce/flowerbase';

initialize({
    projectId: process.env.PROJECT_ID ?? "",
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    mongodbUrl: process.env.DB_CONNECTION_STRING,
    jwtSecret: process.env.APP_SECRET,
    host: process.env.HOST
})
