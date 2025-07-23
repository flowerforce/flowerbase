import { FastifyInstance } from 'fastify'
import { Collection, Document, FindCursor, WithId } from 'mongodb'
import { User } from '../../auth/dtos'
import { Filter, Rules } from '../../features/rules/interface'
import { Role } from '../../utils/roles/interface'

export type MongodbAtlasFunction = (
  app: FastifyInstance,
  {
    rules,
    user,
    run_as_system
  }: {
    user?: User
    rules?: Rules
    run_as_system?: boolean
  }
) => {
  db: (dbName: string) => {
    collection: (collName: string) => ReturnType<GetOperatorsFunction>
  }
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
    run_as_system
  }: {
    user?: User
    rules?: Rules
    run_as_system?: boolean
    collName: string
  }
) => {
  findOne: (...params: Parameters<Method<'findOne'>>) => ReturnType<Method<'findOne'>>
  deleteOne: (...params: Parameters<Method<'findOne'>>) => ReturnType<Method<'findOne'>>
  insertOne: (
    ...params: Parameters<Method<'insertOne'>>
  ) => ReturnType<Method<'insertOne'>>
  updateOne: (
    ...params: Parameters<Method<'updateOne'>>
  ) => ReturnType<Method<'updateOne'>>
  find: (...params: Parameters<Method<'find'>>) => FindCursor
  watch: (...params: Parameters<Method<'watch'>>) => ReturnType<Method<'watch'>>
  aggregate: (
    ...params: Parameters<Method<'aggregate'>>
  ) => Promise<ReturnType<Method<'aggregate'>>>
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