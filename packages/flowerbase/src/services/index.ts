import Api from './api'
import Auth from './auth'
import Aws from './aws'
import MongoDbAtlas from './mongodb-atlas'

export const services = {
  api: Api,
  aws: Aws,
  auth: Auth,
  'mongodb-atlas': MongoDbAtlas
}
