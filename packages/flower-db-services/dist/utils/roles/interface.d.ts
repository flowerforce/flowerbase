export type PermissionExpression = boolean;
export type FieldPermissionExpression = {
    read?: boolean;
    write?: boolean;
};
export interface DocumentFiltersPermissions {
    read?: PermissionExpression;
    write?: PermissionExpression;
}
export interface Role {
    name: string;
    apply_when: Record<string, any>;
    search?: PermissionExpression;
    document_filters?: DocumentFiltersPermissions;
    read?: PermissionExpression;
    write?: PermissionExpression;
    insert?: PermissionExpression;
    delete?: PermissionExpression;
    fields?: {
        [K: string]: FieldPermissionExpression;
    };
    additional_fields?: {
        [K: string]: FieldPermissionExpression;
    };
}
export interface Params {
    roles: Role[];
    cursor: any;
    expansions: Record<string, any>;
    type: 'insert' | 'read' | 'delete' | 'search' | 'write';
}
export type Condition = Record<string, any>;
//# sourceMappingURL=interface.d.ts.map