
import * as RealmWeb from 'realm-web'

const DB_NAME = import.meta.env.VITE_DB_NAME as string
const APP_ID = import.meta.env.VITE_APP_ID as string

const appConfig = {
  id: APP_ID,
  timeout: 10000,
  baseUrl: import.meta.env.VITE_SERVER_URL,
}

export const app = new RealmWeb.App(appConfig)
export const db = (dbname: string = DB_NAME) =>
  app.currentUser!.mongoClient('mongodb-atlas').db(dbname)
export const Realm = RealmWeb