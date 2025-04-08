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
exports.checkFieldsPropertyExists = exports.evaluateTopLevelPermissionsFn = exports.evaluateDocumentFiltersFn = void 0;
const someAsync_1 = require("../../helpers/someAsync");
const helpers_1 = require("../helpers");
const readOnlyPermissions = ['read'];
const readWritePermissions = ['write', 'delete', 'insert', ...readOnlyPermissions];
const evaluateDocumentFiltersFn = (_a, currentType_1) => __awaiter(void 0, [_a, currentType_1], void 0, function* ({ params, role, user }, currentType) {
    var _b;
    const permissions = currentType === "read" ? readOnlyPermissions : readWritePermissions;
    return yield (0, someAsync_1.someAsync)([
        permissions.includes(params.type) && ((_b = role.document_filters) === null || _b === void 0 ? void 0 : _b[currentType])
    ]
        .filter(Boolean), (expr) => __awaiter(void 0, void 0, void 0, function* () { return (0, helpers_1.evaluateExpression)(params, expr, user); }));
});
exports.evaluateDocumentFiltersFn = evaluateDocumentFiltersFn;
const evaluateTopLevelPermissionsFn = (_a, currentType_1) => __awaiter(void 0, [_a, currentType_1], void 0, function* ({ params, role, user }, currentType) {
    return role[currentType] ? yield (0, helpers_1.evaluateExpression)(params, role[currentType], user) : undefined;
});
exports.evaluateTopLevelPermissionsFn = evaluateTopLevelPermissionsFn;
const checkFieldsPropertyExists = ({ role }) => {
    var _a;
    return !!Object.keys((_a = role.fields) !== null && _a !== void 0 ? _a : {}).length;
};
exports.checkFieldsPropertyExists = checkFieldsPropertyExists;
