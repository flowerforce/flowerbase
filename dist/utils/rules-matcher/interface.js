"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesModes = exports.RulesOperators = void 0;
var RulesOperators;
(function (RulesOperators) {
    RulesOperators["$exists"] = "$exists";
    RulesOperators["$eq"] = "$eq";
    RulesOperators["$ne"] = "$ne";
    RulesOperators["$gt"] = "$gt";
    RulesOperators["$gte"] = "$gte";
    RulesOperators["$lt"] = "$lt";
    RulesOperators["$lte"] = "$lte";
    RulesOperators["$strGt"] = "$strGt";
    RulesOperators["$strGte"] = "$strGte";
    RulesOperators["$strLt"] = "$strLt";
    RulesOperators["$strLte"] = "$strLte";
    RulesOperators["$in"] = "$in";
    RulesOperators["$nin"] = "$nin";
    RulesOperators["$all"] = "$all";
    RulesOperators["$regex"] = "$regex";
})(RulesOperators || (exports.RulesOperators = RulesOperators = {}));
var RulesModes;
(function (RulesModes) {
    RulesModes["$and"] = "$and";
    RulesModes["$or"] = "$or";
})(RulesModes || (exports.RulesModes = RulesModes = {}));
