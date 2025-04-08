export declare class StateManager {
    private static _state;
    static select<K extends keyof typeof this._state>(key: K): NonNullable<typeof this._state[K]>;
    static setData<K extends keyof typeof this._state>(key: K, value: typeof this._state[K]): void;
}
//# sourceMappingURL=state.d.ts.map