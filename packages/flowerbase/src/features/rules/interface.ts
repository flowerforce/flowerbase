import { Document } from 'mongodb'
export interface Filter {
  name: string
  query: Record<string, unknown>
  apply_when: Record<string, unknown>
  projection?: Projection
}
export type Projection = Record<string, 0 | 1>
export interface Role {
  name: string
  apply_when: Record<string, unknown>
  insert: boolean
  delete: boolean
  search: boolean
  read: boolean
  write: boolean
}

export interface RulesConfig {
  database: string
  collection: string
  filters: Filter[]
  roles: Role[]

}

export type Rules = Record<string, RulesConfig>

export type AggregationPipelineStage =
  | { $match: Record<string, unknown> }
  | { $project: Record<string, unknown> }
  | { $sort: Record<string, unknown> }
  | { $limit: number }
  | { $skip: number }
  | { $group: Record<string, unknown> }
  | { $lookup: LookupStage }
  | { $facet: Record<string, AggregationPipelineStage[]> }
  | { $unionWith: UnionWithStage }

export interface LookupStage {
  from: string;
  localField?: string;
  foreignField?: string;
  as: string;
  let?: Record<string, unknown>;
  pipeline?: AggregationPipelineStage[];
}

export type AggregationPipeline = Document[]

export type UnionWithStage = string | UnionWithNestedStage
type UnionWithNestedStage = { coll: string, pipeline: AggregationPipelineStage[] }

export enum STAGES_TO_SEARCH {
  LOOKUP = "$lookup",
  UNION_WITH = "$unionWith",
  FACET = "$facet"
}