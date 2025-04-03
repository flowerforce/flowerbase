"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandQuery = expandQuery;
const get_1 = __importDefault(require("lodash/get"));
// Funzione che espande dinamicamente i placeholder con supporto per percorsi annidati
function expandQuery(template, objs) {
    let expandedQuery = JSON.stringify(template); // Converti l'oggetto in una stringa per sostituire i placeholder
    const regex = /:\s*"%%([a-zA-Z0-9_.]+)"/g;
    Object.keys(objs).forEach(() => {
        // Espandi tutti i placeholder %%values.<nested.property>
        const callback = (match, path) => {
            const value = (0, get_1.default)(objs, `%%${path}`); // Recupera il valore annidato da values
            const finalValue = typeof value === 'string' ? `"${value}"` : value && JSON.stringify(value);
            return `:${value !== undefined ? finalValue : match}`; // Sostituisci se esiste, altrimenti lascia il placeholder
        };
        expandedQuery = expandedQuery.replace(regex, callback);
    });
    return JSON.parse(expandedQuery); // Converti la stringa JSON di nuovo in un oggetto
}
