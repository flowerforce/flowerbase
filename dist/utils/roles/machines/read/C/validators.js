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
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkFieldsPropertyExists = exports.evaluateTopLevelWriteFn = exports.evaluateTopLevelReadFn = void 0;
const helpers_1 = require("../../../helpers");
const evaluateTopLevelReadFn = (_a) => __awaiter(void 0, [_a], void 0, function* ({ params, role, user }) {
    if (params.type === 'read') {
        return role.read === undefined ? undefined : yield (0, helpers_1.evaluateExpression)(params, role.read, user);
    }
    return false;
});
exports.evaluateTopLevelReadFn = evaluateTopLevelReadFn;
const evaluateTopLevelWriteFn = (_a) => __awaiter(void 0, [_a], void 0, function* ({ params, role, user }) {
    const { type } = params;
    if (type === 'read' || type === "write") {
        return yield (0, helpers_1.evaluateExpression)(params, role.write, user);
    }
});
exports.evaluateTopLevelWriteFn = evaluateTopLevelWriteFn;
const checkFieldsPropertyExists = ({ role }) => {
    var _a;
    return !!Object.keys((_a = role.fields) !== null && _a !== void 0 ? _a : {}).length;
};
exports.checkFieldsPropertyExists = checkFieldsPropertyExists;
