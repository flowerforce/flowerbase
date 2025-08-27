import get from 'lodash/get'

const removeExtraColons = (val: unknown) => {
  return val?.toString().replace(/:+/g, ":")
}

// Funzione che espande dinamicamente i placeholder con supporto per percorsi annidati
export function expandQuery(
  template: Record<string, unknown>,
  objs: Record<string, unknown>
) {
  let expandedQuery = JSON.stringify(template) // Converti l'oggetto in una stringa per sostituire i placeholder
  const regex = /:\s*"%%([a-zA-Z0-9_.]+)"/g
  Object.keys(objs).forEach(() => {
    // Espandi tutti i placeholder %%values.<nested.property>

    const callback = (match: string, path: string) => {
      const value = get(objs, `%%${path}`) // Recupera il valore annidato da values
      const finalValue = typeof value === 'string' ? `"${value}"` : value && JSON.stringify(value)
      // TODO tolto i primi : creava questo tipo di oggetto {"userId"::"%%user.id"}
      const val = `:${value !== undefined ? finalValue : match}`; // Sostituisci se esiste, altrimenti lascia il placeholder
      return removeExtraColons(val)
    }

    expandedQuery = expandedQuery.replace(
      regex,
      callback as Parameters<typeof expandedQuery.replaceAll>[1]
    )
  })
  return JSON.parse(expandedQuery) // Converti la stringa JSON di nuovo in un oggetto
}
