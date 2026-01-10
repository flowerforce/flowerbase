import get from 'lodash/get'

const resolvePlaceholder = (value: string, objs: Record<string, unknown>) => {
  if (!value.startsWith('%%')) return value

  const path = value.slice(2)
  const [rootKey, ...rest] = path.split('.')
  const rootToken = `%%${rootKey}`
  const rootValue = objs[rootToken]

  if (!rest.length) {
    return rootValue === undefined ? value : rootValue
  }

  const resolved = get(rootValue as object, rest.join('.'))
  return resolved === undefined ? value : resolved
}

const expandValue = (input: unknown, objs: Record<string, unknown>): unknown => {
  if (Array.isArray(input)) {
    return input.map((item) => expandValue(item, objs))
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, val]) => [key, expandValue(val, objs)])
    )
  }
  if (typeof input === 'string') {
    return resolvePlaceholder(input, objs)
  }
  return input
}

// Espande dinamicamente i placeholder con supporto per array e percorsi annidati
export function expandQuery(
  template: Record<string, unknown>,
  objs: Record<string, unknown>
) {
  return expandValue(template, objs) as Record<string, unknown>
}
