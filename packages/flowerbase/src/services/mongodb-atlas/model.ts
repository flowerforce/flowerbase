import { FastifyInstance } from 'fastify'
import {
  ClientSession,
  ClientSessionOptions,
  Collection,
  Document,
  FindCursor,
  FindOneAndUpdateOptions,
  FindOneOptions,
  FindOptions,
  Filter as MongoFilter,
  UpdateFilter,
  WithId
} from 'mongodb'
import { User } from '../../auth/dtos'
import { Filter, Rules } from '../../features/rules/interface'
import { Role } from '../../utils/roles/interface'

export type MongodbAtlasFunction = (
  app: FastifyInstance,
  {
    rules,
    user,
    run_as_system,
    monitoring
  }: {
    user?: User
    rules?: Rules
    run_as_system?: boolean
    monitoring?: { invokedFrom?: string }
  }
) => {
  db: (dbName: string) => {
    collection: (collName: string) => ReturnType<GetOperatorsFunction>
  }
  startSession: (options?: ClientSessionOptions) => ClientSession
}

export type GetValidRuleParams<T extends Role | Filter> = {
  filters: T[]
  user: User
  record?: WithId<Document> | Document | null
}
type Method<T extends keyof Collection<Document>> = Collection<Document>[T]

export type GetOperatorsFunction = (
  collection: Collection<Document>,
  {
    rules,
    collName,
    user,
    run_as_system,
    monitoringOrigin
  }: {
    user?: User
    rules?: Rules
    run_as_system?: boolean
    collName: string
    monitoringOrigin?: string
  }
) => {
  findOne: (
    filter?: MongoFilter<Document>,
    projection?: Document,
    options?: FindOneOptions
  ) => ReturnType<Method<'findOne'>>
  deleteOne: (...params: Parameters<Method<'deleteOne'>>) => ReturnType<Method<'deleteOne'>>
  insertOne: (
    ...params: Parameters<Method<'insertOne'>>
  ) => ReturnType<Method<'insertOne'>>
  updateOne: (
    ...params: Parameters<Method<'updateOne'>>
  ) => ReturnType<Method<'updateOne'>>
  findOneAndUpdate: (
    filter: MongoFilter<Document>,
    update: UpdateFilter<Document> | Document[],
    options?: FindOneAndUpdateOptions
  ) => Promise<Document | null>
  find: (
    filter?: MongoFilter<Document>,
    projection?: Document,
    options?: FindOptions
  ) => FindCursor
  count: (
    ...params: Parameters<Method<'countDocuments'>>
  ) => ReturnType<Method<'countDocuments'>>
  countDocuments: (
    ...params: Parameters<Method<'countDocuments'>>
  ) => ReturnType<Method<'countDocuments'>>
  watch: (...params: Parameters<Method<'watch'>>) => ReturnType<Method<'watch'>>
  aggregate: (
    ...params: [...Parameters<Method<'aggregate'>>, isClient: boolean]
  ) => ReturnType<Method<'aggregate'>>
  insertMany: (
    ...params: Parameters<Method<'insertMany'>>
  ) => ReturnType<Method<'insertMany'>>
  updateMany: (
    ...params: Parameters<Method<'updateMany'>>
  ) => ReturnType<Method<'updateMany'>>
  deleteMany: (
    ...params: Parameters<Method<'deleteMany'>>
  ) => ReturnType<Method<'deleteMany'>>
}


export enum CRUD_OPERATIONS {
  CREATE = "CREATE",
  READ = "READ",
  UPDATE = "UPDATE",
  DELETE = "DELETE"

}
