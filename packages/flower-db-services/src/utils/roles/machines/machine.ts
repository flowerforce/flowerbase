import { Document } from "mongodb"
import { User } from "../../../auth/dtos";
import { Params, Role } from "../interface";
import { MachineContext, PrevParams, States, StepResult, ValidationStatus } from "./interface";
import { STEP_A_STATES } from "./read/A";
import { STEP_B_STATES } from "./read/B";
import { STEP_C_STATES } from "./read/C";
import { STEP_D_STATES } from "./read/D";

const machines = [STEP_A_STATES, STEP_B_STATES, STEP_C_STATES, STEP_D_STATES]

export class StateMachine {
    private _context: MachineContext
    private _validation: StepResult = {
        status: null,
        nextInitialStep: null
    }
    private _machines = machines
    private _currentStep: {
        names: readonly string[]
        states: States
        validation: ValidationStatus,
        completed?: boolean,
        initialStep: string | null
    }
    constructor(role: Role, params: Params, user: User, enableLog?: boolean) {
        this._context = { role, params, user, enableLog }
        this._currentStep = {
            names: [],
            states: {},
            validation: {
                status: null
            },
            initialStep: null
        }
    }

    async runValidation() {
        for await (const machine of this._machines) {
            this._currentStep = { names: Object.freeze(Object.keys(machine)) as readonly (keyof typeof machine)[], states: machine, validation: { status: null }, initialStep: null }
            await this.runMachine(this._validation.nextInitialStep);

            this._validation.nextInitialStep = this._currentStep.initialStep;
            if (this._currentStep.validation.status !== null) {
                this._validation.status = this._currentStep.validation.status;
                this._validation.document = this._currentStep.validation.document;
                break;
            }
        }
        return this._validation;
    }

    private async runMachine(initialStep: string | null) {
        const executeStep = async (step: keyof typeof this._currentStep.states, params?: PrevParams) => {
            const currentStep = this._currentStep.states[step]
            const next = (nextStep: keyof typeof this._currentStep.states, params?: PrevParams) =>
                executeStep(nextStep, params)

            await currentStep({
                context: { ...this._context, prevParams: params },
                next,
                endValidation: this.endValidation.bind(this),
                goToNextValidationStage: this.goToNextValidationStage.bind(this),
                initialStep
            })

            if (this._currentStep.validation.status !== null || this._currentStep.completed !== undefined)
                return { isValid: this._currentStep.validation.status, ...this._currentStep }
        }
        const nextStep = initialStep && this._currentStep.states[initialStep] ? initialStep : this._currentStep.names[0]
        await executeStep(nextStep)
    }

    private endValidation({ success, document }: { success: boolean, document?: Document }) {
        this._currentStep.validation.status = success
        if (success) {
            this._currentStep.validation.document = document || this._context.params.cursor
        }
    }


    private goToNextValidationStage(initialStep: string | null = null) {
        this._currentStep.completed = true
        this._currentStep.initialStep = initialStep
    }


}