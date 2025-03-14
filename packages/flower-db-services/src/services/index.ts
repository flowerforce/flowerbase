import Api from './api'
import Aws from './aws'
import MongoDbAtlas from './mongodb-atlas'

export const services = {
  api: Api,
  aws: Aws,
  'mongodb-atlas': MongoDbAtlas
}
