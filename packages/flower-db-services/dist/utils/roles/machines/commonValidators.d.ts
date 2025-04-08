import { DocumentFiltersPermissions } from "../interface";
import { MachineContext } from "./interface";
export declare const evaluateDocumentFiltersFn: ({ params, role, user }: MachineContext, currentType: keyof DocumentFiltersPermissions) => Promise<boolean>;
export declare const evaluateTopLevelPermissionsFn: ({ params, role, user }: MachineContext, currentType: MachineContext["params"]["type"]) => Promise<boolean | undefined>;
export declare const checkFieldsPropertyExists: ({ role }: MachineContext) => boolean;
//# sourceMappingURL=commonValidators.d.ts.map