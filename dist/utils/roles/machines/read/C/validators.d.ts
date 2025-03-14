import { MachineContext } from "../../interface";
export declare const evaluateTopLevelReadFn: ({ params, role, user }: MachineContext) => Promise<boolean | undefined>;
export declare const evaluateTopLevelWriteFn: ({ params, role, user }: MachineContext) => Promise<boolean | undefined>;
export declare const checkFieldsPropertyExists: ({ role }: MachineContext) => boolean;
//# sourceMappingURL=validators.d.ts.map