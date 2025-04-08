export interface Filter {
    name: string;
    query: Record<string, unknown>;
    apply_when: Record<string, unknown>;
}
export interface Role {
    name: string;
    apply_when: Record<string, unknown>;
    insert: boolean;
    delete: boolean;
    search: boolean;
    read: boolean;
    write: boolean;
}
export interface RulesConfig {
    database: string;
    collection: string;
    filters: Filter[];
    roles: Role[];
}
export type Rules = Record<string, RulesConfig>;
//# sourceMappingURL=interface.d.ts.map