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

export type GetOperatorsFunction = (
  collection: Collection<Document>,
  {
    rules,
    collName,
    user,
    run_as_system,
  }: {
    user?: User
    rules?: Rules
    run_as_system?: boolean
    collName: string
  }
) => {
  findOne: (
    ...params: Parameters<Collection<Document>['findOne']>
  ) => ReturnType<Collection<Document>['findOne']>
  deleteOne: (
    ...params: Parameters<Collection<Document>['deleteOne']>
  ) => ReturnType<Collection<Document>['deleteOne']>
  insertOne: (
    data: Parameters<Collection<Document>['insertOne']>[0] & {
      $set: Record<string, string>
      $setOnInsert: Record<string, string>
    }
  ) => ReturnType<Collection<Document>['insertOne']>
  updateOne: (
    query: Parameters<Collection<Document>['updateOne']>[0],
    data: Parameters<Collection<Document>['updateOne']>[1] & {
      $set: Record<string, string>
      $setOnInsert: Record<string, string>
    }
  ) => ReturnType<Collection<Document>['updateOne']>
  find: (...params: Parameters<Collection<Document>['find']>) => FindCursor
  watch: (
    ...params: Parameters<Collection<Document>['watch']>
  ) => Promise<ReturnType<Collection<Document>['watch']>>
  aggregate: (
    ...params: Parameters<Collection<Document>['aggregate']>
  ) => ReturnType<Collection<Document>['aggregate']>
  insertMany: (...params: Parameters<Collection<Document>['insertMany']>) => ReturnType<Collection<Document>['insertMany']>
  updateMany: (...params: Parameters<Collection<Document>['updateMany']>) => ReturnType<Collection<Document>['updateMany']>
}
