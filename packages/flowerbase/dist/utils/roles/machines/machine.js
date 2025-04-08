"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMachine = void 0;
const read_1 = require("./read");
const write_1 = require("./write");
class StateMachine {
    constructor(role, params, user, enableLog) {
        this._validation = {
            status: null,
            nextInitialStep: null
        };
        this._context = { role, params, user, enableLog };
        this._machines = params.type === "read" ? read_1.READ_MACHINE : write_1.WRITE_MACHINE;
        this._currentStep = {
            names: [],
            states: {},
            validation: {
                status: null
            },
            initialStep: null
        };
    }
    runValidation() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, e_1, _b, _c;
            try {
                for (var _d = true, _e = __asyncValues(this._machines), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
                    _c = _f.value;
                    _d = false;
                    const machine = _c;
                    this._currentStep = { names: Object.freeze(Object.keys(machine)), states: machine, validation: { status: null }, initialStep: null };
                    yield this.runMachine(this._validation.nextInitialStep);
                    this._validation.nextInitialStep = this._currentStep.initialStep;
                    if (this._currentStep.validation.status !== null) {
                        this._validation.status = this._currentStep.validation.status;
                        this._validation.document = this._currentStep.validation.document;
                        break;
                    }
                }
            }
            catch (e_1_1) { e_1 = { error: e_1_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
                }
                finally { if (e_1) throw e_1.error; }
            }
            return this._validation;
        });
    }
    runMachine(initialStep) {
        return __awaiter(this, void 0, void 0, function* () {
            const executeStep = (step, params) => __awaiter(this, void 0, void 0, function* () {
                const currentStep = this._currentStep.states[step];
                const next = (nextStep, params) => executeStep(nextStep, params);
                yield currentStep({
                    context: Object.assign(Object.assign({}, this._context), { prevParams: params }),
                    next,
                    endValidation: this.endValidation.bind(this),
                    goToNextValidationStage: this.goToNextValidationStage.bind(this),
                    initialStep
                });
                if (this._currentStep.validation.status !== null || this._currentStep.completed !== undefined)
                    return Object.assign({ isValid: this._currentStep.validation.status }, this._currentStep);
            });
            const nextStep = initialStep && this._currentStep.states[initialStep] ? initialStep : this._currentStep.names[0];
            yield executeStep(nextStep);
        });
    }
    endValidation({ success, document }) {
        this._currentStep.validation.status = success;
        if (success) {
            this._currentStep.validation.document = document || this._context.params.cursor;
        }
    }
    goToNextValidationStage(initialStep = null) {
        this._currentStep.completed = true;
        this._currentStep.initialStep = initialStep;
    }
}
exports.StateMachine = StateMachine;
