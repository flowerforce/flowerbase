"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIsValidFieldNameFn = exports.checkAdditionalFieldsFn = void 0;
const checkAdditionalFieldsFn = ({ role }) => {
    return !!Object.keys(role.additional_fields || {}).length;
};
exports.checkAdditionalFieldsFn = checkAdditionalFieldsFn;
const checkIsValidFieldNameFn = ({ role, params }) => {
    const { cursor } = params;
    const { fields = {}, additional_fields = {} } = role;
    const rulesOnId = !!(fields["_id"] || additional_fields["_id"]);
    const filteredDocument = Object.entries(cursor).reduce((filteredDocument, [key, value]) => {
        var _a, _b;
        if (fields[key]) {
            return (role.fields[key].read || role.fields[key].write) ? Object.assign(Object.assign({}, filteredDocument), { [key]: value }) : filteredDocument;
        }
        return (((_a = additional_fields[key]) === null || _a === void 0 ? void 0 : _a.read) || ((_b = additional_fields[key]) === null || _b === void 0 ? void 0 : _b.write)) ? Object.assign(Object.assign({}, filteredDocument), { [key]: value }) : filteredDocument;
    }, {});
    return (rulesOnId || cursor._id === undefined) ? filteredDocument : Object.assign(Object.assign({}, filteredDocument), { "_id": cursor._id });
};
exports.checkIsValidFieldNameFn = checkIsValidFieldNameFn;
