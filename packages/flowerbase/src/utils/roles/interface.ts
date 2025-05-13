export type PermissionExpression = boolean // TODO: add complex condition (%%true: %function)

export type FieldPermissionExpression = {
  read?: boolean
  write?: boolean
}

export interface DocumentFiltersPermissions {
  read?: PermissionExpression
  write?: PermissionExpression
}

export interface Role {
  name: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply_when: Record<string, any> // TODO -> define this type
  search?: PermissionExpression
  document_filters?: DocumentFiltersPermissions
  read?: PermissionExpression
  write?: PermissionExpression
  insert?: PermissionExpression
  delete?: PermissionExpression
  fields?: {
    [K: string]: FieldPermissionExpression
  }
  additional_fields?: {
    [K: string]: FieldPermissionExpression
  }
}

export interface Params {
  roles: Role[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor: any // TODO -> define this type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expansions: Record<string, any> // TODO -> define this type
  type: 'insert' | 'read' | 'delete' | 'search' | 'write'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Condition = Record<string, any>
