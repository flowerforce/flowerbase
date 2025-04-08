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
exports.activateTriggers = void 0;
const services_1 = require("../../services");
const utils_1 = require("./utils");
/**
 * > Used to activate all app triggers
 * @testable
 * @param fastify -> the fastify instance
 * @param triggersList -> the list of all triggers
 * @param functionsList -> the list of all functions
 */
const activateTriggers = (_a) => __awaiter(void 0, [_a], void 0, function* ({ fastify, triggersList, functionsList }) {
    var _b, triggersList_1, triggersList_1_1;
    var _c, e_1, _d, _e;
    try {
        try {
            for (_b = true, triggersList_1 = __asyncValues(triggersList); triggersList_1_1 = yield triggersList_1.next(), _c = triggersList_1_1.done, !_c; _b = true) {
                _e = triggersList_1_1.value;
                _b = false;
                const trigger = _e;
                const { content } = trigger;
                const { type, config, event_processors } = content;
                const functionName = event_processors.FUNCTION.config.function_name;
                const triggerHandler = functionsList[functionName];
                yield utils_1.TRIGGER_HANDLERS[type]({ config, triggerHandler, app: fastify, services: services_1.services, functionsList });
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (!_b && !_c && (_d = triggersList_1.return)) yield _d.call(triggersList_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
    }
    catch (e) {
        console.error('Error while activating triggers', e.message);
    }
});
exports.activateTriggers = activateTriggers;
