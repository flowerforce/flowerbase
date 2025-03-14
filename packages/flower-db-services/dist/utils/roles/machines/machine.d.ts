import { User } from "../../../auth/dtos";
import { Params, Role } from "../interface";
import { StepResult } from "./interface";
export declare class StateMachine {
    private _context;
    private _validation;
    private _machines;
    private _currentStep;
    constructor(role: Role, params: Params, user: User);
    runValidation(): Promise<StepResult>;
    private runMachine;
    private endValidation;
    private goToNextValidationStage;
}
//# sourceMappingURL=machine.d.ts.map