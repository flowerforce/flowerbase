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
exports.evaluateDocumentFiltersReadFn = exports.evaluateDocumentFiltersWriteFn = void 0;
const someAsync_1 = require("../../../../helpers/someAsync");
const helpers_1 = require("../../../helpers");
const readOnly = ['read'];
const readWrite = ['write', 'delete', 'insert', ...readOnly];
const evaluateDocumentFiltersWriteFn = ({ params, role, user }) => {
    var _a;
    return (0, someAsync_1.someAsync)([
        readWrite.includes(params.type) && ((_a = role.document_filters) === null || _a === void 0 ? void 0 : _a.write)
    ]
        .filter(Boolean), (expr) => __awaiter(void 0, void 0, void 0, function* () { return (0, helpers_1.evaluateExpression)(params, expr, user); }));
};
exports.evaluateDocumentFiltersWriteFn = evaluateDocumentFiltersWriteFn;
const evaluateDocumentFiltersReadFn = (_a) => __awaiter(void 0, [_a], void 0, function* ({ params, role, user }) {
    var _b;
    return yield (0, someAsync_1.someAsync)([
        readOnly.includes(params.type) && ((_b = role.document_filters) === null || _b === void 0 ? void 0 : _b.read)
    ]
        .filter(Boolean), (expr) => __awaiter(void 0, void 0, void 0, function* () { return (0, helpers_1.evaluateExpression)(params, expr, user); }));
});
exports.evaluateDocumentFiltersReadFn = evaluateDocumentFiltersReadFn;
