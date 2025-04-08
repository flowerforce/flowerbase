"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFormattedQuery = exports.getValidRule = void 0;
const rules_1 = require("../../utils/rules");
const utils_1 = __importDefault(require("../../utils/rules-matcher/utils"));
const getValidRule = ({ filters = [], user, record = null }) => {
    if (!filters.length)
        return [];
    return filters.filter((f) => {
        if (Object.keys(f.apply_when).length === 0)
            return true;
        const conditions = (0, rules_1.expandQuery)(f.apply_when, {
            '%%user': user,
            '%%true': true
            /** values */
        });
        const valid = utils_1.default.checkRule(conditions, Object.assign(Object.assign({}, (record !== null && record !== void 0 ? record : {})), { '%%user': user }), {});
        return valid;
    });
};
exports.getValidRule = getValidRule;
const getFormattedQuery = (filters = [], query, user) => {
    const preFilter = (0, exports.getValidRule)({ filters, user });
    const isValidPreFilter = !!(preFilter === null || preFilter === void 0 ? void 0 : preFilter.length);
    return [
        isValidPreFilter && (0, rules_1.expandQuery)(preFilter[0].query, { '%%user': user }),
        query
    ].filter(Boolean);
};
exports.getFormattedQuery = getFormattedQuery;
