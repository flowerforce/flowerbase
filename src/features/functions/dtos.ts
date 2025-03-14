import { Document } from "mongodb"
import { Arguments } from '../../auth/dtos'
import { GetOperatorsFunction } from '../../services/mongodb-atlas/model'

type MethodName = Exclude<keyof ReturnType<GetOperatorsFunction>, 'match'>

export type FunctionCallDto =
  | {
    name: MethodName
    arguments: ArgumentsData
  }
  | {
    arguments: ArgumentsData
    name: MethodName
    service: 'mongodb-atlas'
  }

type ArgumentsData = Arguments<{
  database: string
  collection: string
  query: Parameters<GetOperatorsFunction>
  update: Document
  document: Document
}>
