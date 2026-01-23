import { Document } from 'mongodb'
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

export type FunctionCallBase64Dto = {
  baas_request?: string
  stitch_request?: string
}

type ArgumentsData = Arguments<{
  database: string
  collection: string
  filter?: Document
  query: Parameters<GetOperatorsFunction>
  update: Document
  projection?: Document
  options?: Document
  returnNewDocument?: boolean
  document: Document
  documents: Document[]
  pipeline?: Document[]
}>

export type Base64Function = {
  name: string
  arguments: Argument[]
  service: string
}

type Argument = {
  database: string
  collection: string
}
