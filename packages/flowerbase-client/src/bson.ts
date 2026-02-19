import { EJSON, ObjectId, BSON as RawBSON } from 'bson'

const ObjectID = ObjectId
const BSON = Object.assign({}, RawBSON, { ObjectId, ObjectID })

export { BSON, EJSON, ObjectId, ObjectID }
