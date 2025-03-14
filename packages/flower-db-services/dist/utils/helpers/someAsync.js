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
exports.someAsync = someAsync;
/**
 * Asynchronously checks if at least one element in the array satisfies the given asynchronous callback function.
 *
 * @template T - The type of elements in the array.
 * @param {T[]} array - The array to iterate over.
 * @param {(element: T, index: number, arr: T[]) => Promise<boolean>} callback - An asynchronous function that takes an element, its index, and the original array,
 * and returns a Promise resolving to `true` if the condition is met, otherwise `false`.
 * @returns {Promise<boolean>} A promise that resolves to `true` if at least one element satisfies the callback condition, otherwise `false`.
 * @tested
 */
function someAsync(array, callback) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, array_1, array_1_1;
        var _b, e_1, _c, _d;
        let i = 0;
        try {
            for (_a = true, array_1 = __asyncValues(array); array_1_1 = yield array_1.next(), _b = array_1_1.done, !_b; _a = true) {
                _d = array_1_1.value;
                _a = false;
                const el = _d;
                const isValid = yield callback(el, i, array);
                if (isValid) {
                    return true;
                }
                i++;
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_a && !_b && (_c = array_1.return)) yield _c.call(array_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return false;
    });
}
