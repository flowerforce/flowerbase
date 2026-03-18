import { App, BSON, Credentials } from '@flowerforce/flowerbase-client'
import { mobileDemoConfig } from '../config/env'

export const flowerbaseApp = new App({
  id: mobileDemoConfig.appId,
  baseUrl: mobileDemoConfig.baseUrl,
  timeout: 10000
})

export const getTodosCollection = () =>
  flowerbaseApp.currentUser!.mongoClient('mongodb-atlas').db(mobileDemoConfig.databaseName).collection('todos')

export { BSON, Credentials }
