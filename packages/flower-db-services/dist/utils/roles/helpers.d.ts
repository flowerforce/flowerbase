import { PermissionExpression } from './interface';
import { MachineContext } from './machines/interface';
export declare const evaluateExpression: (params: MachineContext["params"], expression?: PermissionExpression, user?: MachineContext["user"]) => Promise<boolean>;
//# sourceMappingURL=helpers.d.ts.map