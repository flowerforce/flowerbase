"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = void 0;
class StateManager {
    static select(key) {
        return this._state[key];
    }
    static setData(key, value) {
        this._state[key] = value;
    }
}
exports.StateManager = StateManager;
StateManager._state = {
    functions: {},
    triggers: [],
    endpoints: [],
    rules: {}
};
