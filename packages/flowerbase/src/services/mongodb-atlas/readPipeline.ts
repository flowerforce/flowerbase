import get from 'lodash/get'
import cloneDeep from 'lodash/cloneDeep'
import { Document, ObjectId } from 'mongodb'
import { User } from '../../auth/dtos'
import { Rules } from '../../features/rules/interface'
import { FieldPermissionExpression, Role } from '../../utils/roles/interface'
import rulesMatcherUtils, { operators } from '../../utils/rules-matcher/utils'
import { expandQuery } from '../../utils/rules'
import { getCollectionRules, getFormattedProjection, getFormattedQuery } from './utils'

/**
 * Compile read authorization before any caller-controlled aggregation stage.
 * Supported document conditions: scalar equality/inequality, exists, in/nin,
 * and/or, and simple object paths. Other rule operators, dynamic root operands,
 * numeric/array paths and executable expressions are rejected explicitly.
 */
type Context = { rules: Rules; user?: User; dbName: string; collName: string }
type Operand = { expression: unknown; constant?: unknown; isConstant: boolean }
const literal = (value: unknown) => ({ $literal: value })
const and = (...items: unknown[]) => ({ $and: items })
const or = (...items: unknown[]) => ({ $or: items })
const not = (item: unknown) => ({ $not: [item] })
const type = (value: unknown) => ({ $type: value })
const eq = (left: unknown, right: unknown) => ({ $eq: [left, right] })
const object = (value: unknown): value is Document =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype
const fail = (detail: string): never => {
  throw new Error(`Aggregation authorization cannot compile ${detail}`)
}

const assertNoExecutableExpressions = (value: unknown) => {
  if (Array.isArray(value)) return value.forEach(assertNoExecutableExpressions)
  if (!object(value)) return
  for (const [key, child] of Object.entries(value)) {
    if (['$function', '$accumulator', '$where', '%function'].includes(key)) fail(key)
    assertNoExecutableExpressions(child)
  }
}

const userContext = (user?: User) => {
  const candidate = user as Record<string, unknown> | undefined
  const customRole = get(candidate, 'custom_data.role')
  const normalized =
    candidate && typeof candidate.role !== 'string' && typeof customRole === 'string'
      ? { ...candidate, role: customRole }
      : user
  return { '%%user': normalized, '%%true': true, '%%false': false }
}

const documentPath = (path: string): unknown => {
  if (!path) return '$$ROOT'
  return path.split('.').reduce<unknown>((input, part) => {
    if (!part || part.startsWith('$') || /[\[\]]/.test(part) || /^\d+$/.test(part))
      fail(`path ${path}`)
    return {
      $getField: {
        field: literal(part),
        input: { $cond: [eq(type(input), 'object'), input, {}] }
      }
    }
  }, '$$ROOT')
}

const fieldOperand = (path: string, user?: User): Operand => {
  if (path === '%%root' || path.startsWith('%%root.')) {
    return {
      expression: documentPath(path === '%%root' ? '' : path.slice(7)),
      isConstant: false
    }
  }
  if (
    path === '%%user' ||
    path.startsWith('%%user.') ||
    ['%%true', '%%false'].includes(path)
  ) {
    const constant = get(userContext(user), path)
    return { expression: literal(constant), constant, isConstant: true }
  }
  if (path.startsWith('%') || path.startsWith('$') || path.startsWith('^'))
    return fail(`reference ${path}`)
  return { expression: documentPath(path), isConstant: false }
}

const empty = (value: unknown) => ({
  $switch: {
    branches: [
      { case: { $in: [type(value), ['missing', 'null']] }, then: true },
      {
        case: eq(type(value), 'string'),
        then: {
          $regexMatch: {
            input: value,
            // ECMAScript whitespace, matching rulesMatcherUtils.isEmpty exactly.
            regex:
              '^[\u0009-\u000d\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*$'
          }
        }
      },
      { case: { $isArray: value }, then: eq({ $size: value }, 0) },
      {
        case: eq(type(value), 'object'),
        then: eq({ $size: { $objectToArray: value } }, 0)
      }
    ],
    default: false
  }
})

const oidHex = /^[a-fA-F0-9]{24}$/
const semanticScalarEqual = (value: unknown, expected: unknown): unknown => {
  if (
    expected instanceof ObjectId ||
    (typeof expected === 'string' && oidHex.test(expected))
  ) {
    const hex =
      expected instanceof ObjectId ? expected.toHexString() : expected.toLowerCase()
    return {
      $switch: {
        branches: [
          {
            case: eq(type(value), 'objectId'),
            then: eq({ $toString: value }, literal(hex))
          },
          { case: eq(type(value), 'string'), then: eq({ $toLower: value }, literal(hex)) }
        ],
        default: false
      }
    }
  }
  if (expected === null) return eq(type(value), 'null')
  if (typeof expected === 'string')
    return and(eq(type(value), 'string'), eq(value, literal(expected)))
  if (typeof expected === 'boolean')
    return and(eq(type(value), 'bool'), eq(value, literal(expected)))
  if (typeof expected === 'number' && Number.isFinite(expected)) {
    return and(
      or(
        { $in: [type(value), ['double', 'int']] },
        and(
          eq(type(value), 'long'),
          { $gte: [value, Number.MIN_SAFE_INTEGER] },
          { $lte: [value, Number.MAX_SAFE_INTEGER] }
        )
      ),
      eq(value, literal(expected))
    )
  }
  return fail('non-scalar equality operand')
}

const scalarList = (value: unknown): unknown[] =>
  (Array.isArray(value) ? value : [value]).flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry]
  )

const membership = (value: unknown, candidates: unknown[]) => ({
  $anyElementTrue: [
    {
      $map: {
        input: {
          $cond: [
            eq(type(value), 'missing'),
            [],
            { $cond: [{ $isArray: value }, value, [value]] }
          ]
        },
        as: 'flowerbaseCandidate',
        in: or(
          ...candidates.map((candidate) =>
            semanticScalarEqual('$$flowerbaseCandidate', candidate)
          )
        )
      }
    }
  ]
})

const compileCondition = (path: string, condition: unknown, user?: User): unknown => {
  const operand = fieldOperand(path, user)
  const expanded = expandQuery({ value: condition }, userContext(user)).value
  const rule = rulesMatcherUtils.getDefaultRule(expanded)
  if (!['$eq', '$ne', '$exists', '%exists', '$in', '$nin'].includes(rule.op))
    return fail(`operator ${rule.op}`)
  if (
    JSON.stringify(expanded)?.includes('%%root') ||
    JSON.stringify(expanded)?.includes('$ref:')
  ) {
    return fail('document-dependent comparison operand')
  }
  if (operand.isConstant) {
    return literal(
      operators[rule.op](operand.constant, rule.value, rule.opt, userContext(user))
    )
  }
  if (rule.op === '$exists' || rule.op === '%exists') {
    if (typeof rule.value !== 'boolean') return fail('non-boolean exists operand')
    return rule.value ? not(empty(operand.expression)) : empty(operand.expression)
  }
  if (rule.op === '$in' || rule.op === '$nin') {
    const includes = membership(operand.expression, scalarList(rule.value))
    return rule.op === '$in' ? includes : not(includes)
  }
  if (Array.isArray(rule.value)) {
    if (rule.op === '$ne') return literal(true) // Separate arrays/objects never compare by identity in persisted rules.
    return and(
      not({ $isArray: operand.expression }),
      membership(operand.expression, scalarList(rule.value))
    )
  }
  const equal = semanticScalarEqual(operand.expression, rule.value)
  return rule.op === '$ne'
    ? not(equal)
    : or(
        equal,
        and(
          { $isArray: operand.expression },
          membership(operand.expression, [rule.value])
        )
      )
}

const compilePermission = (expression: unknown, user?: User): unknown => {
  if (typeof expression === 'boolean') return literal(expression)
  if (expression === undefined || expression === null) return literal(false)
  if (!object(expression)) return fail('permission expression')
  assertNoExecutableExpressions(expression)
  const logical = ['$and', '%and', '$or', '%or'].find((key) =>
    Object.prototype.hasOwnProperty.call(expression, key)
  )
  if (logical) {
    const children = expression[logical]
    if (!Array.isArray(children)) return fail('logical operands')
    return !children.length
      ? literal(true)
      : logical.endsWith('and')
        ? and(...children.map((child) => compilePermission(child, user)))
        : or(...children.map((child) => compilePermission(child, user)))
  }
  return and(
    ...Object.entries(expression).map(([path, condition]) =>
      compileCondition(path, condition, user)
    )
  )
}

const fieldPermission = (
  permission: FieldPermissionExpression | undefined,
  defaultAllow: unknown,
  user?: User
): unknown => {
  if (!permission) return defaultAllow
  if (typeof permission.read !== 'undefined')
    return compilePermission(permission.read, user)
  return or(defaultAllow, compilePermission(permission.write, user))
}

const roleFieldMask = (role: Role, user?: User): unknown => {
  const defaultAllow = or(
    compilePermission(role.read, user),
    compilePermission(role.write, user)
  )
  if (
    !Object.keys(role.fields ?? {}).length &&
    typeof role.additional_fields === 'undefined'
  )
    return literal(true)
  const additional = role.additional_fields ?? {}
  const general =
    'read' in additional || 'write' in additional
      ? (additional as FieldPermissionExpression)
      : undefined
  const namedAdditional = Object.fromEntries(
    Object.entries(additional).filter(
      ([, value]) => object(value) && ('read' in value || 'write' in value)
    )
  ) as Record<string, FieldPermissionExpression>
  const fields = { ...namedAdditional, ...(role.fields ?? {}) }
  return {
    $switch: {
      branches: [
        { case: eq('$$flowerbaseField.k', literal('_id')), then: true },
        ...Object.entries(fields).map(([name, permission]) => ({
          case: eq('$$flowerbaseField.k', literal(name)),
          then: fieldPermission(permission, defaultAllow, user)
        }))
      ],
      default: fieldPermission(general, defaultAllow, user)
    }
  }
}

const roleReadGuard = (role: Role, user?: User): unknown => {
  const hasFields =
    !!Object.keys(role.fields ?? {}).length ||
    typeof role.additional_fields !== 'undefined'
  const permission = hasFields
    ? or(
        compilePermission(role.write, user),
        role.read === undefined ? literal(true) : compilePermission(role.read, user)
      )
    : or(compilePermission(role.read, user), compilePermission(role.write, user))
  return and(
    permission,
    role.document_filters
      ? or(
          compilePermission(role.document_filters.read, user),
          compilePermission(role.document_filters.write, user)
        )
      : literal(true)
  )
}

const guardedStages = ({ rules, dbName, collName, user }: Context): Document[] => {
  const config = getCollectionRules(rules, dbName, collName)
  assertNoExecutableExpressions(config)
  const roles = config.roles as Role[]
  const selected = (then: (role: Role) => unknown) =>
    roles.length
      ? {
          $switch: {
            branches: roles.map((role) => ({
              case: compilePermission(role.apply_when, user),
              then: then(role)
            })),
            default: false
          }
        }
      : literal(false)
  const filter = getFormattedQuery(config.filters, {}, user)
  const projection = getFormattedProjection(config.filters, user)
  return [
    ...(filter.length ? [{ $match: { $and: filter } }] : []),
    { $match: { $expr: selected((role) => roleReadGuard(role, user)) } },
    {
      $replaceRoot: {
        newRoot: {
          $arrayToObject: {
            $filter: {
              input: { $objectToArray: '$$ROOT' },
              as: 'flowerbaseField',
              cond: selected((role) => roleFieldMask(role, user))
            }
          }
        }
      }
    },
    ...(projection ? [{ $project: projection }] : [])
  ]
}

const safeStages = new Set([
  '$match',
  '$project',
  '$addFields',
  '$set',
  '$unset',
  '$replaceRoot',
  '$replaceWith',
  '$sort',
  '$limit',
  '$skip',
  '$group',
  '$count',
  '$unwind',
  '$sortByCount',
  '$sample',
  '$bucket',
  '$bucketAuto',
  '$setWindowFields',
  '$densify',
  '$fill',
  '$lookup',
  '$unionWith',
  '$facet'
])

const joinPredicate = (foreign: unknown, local: unknown) => ({
  $gt: [
    {
      $size: {
        $setIntersection: [
          { $cond: [{ $isArray: foreign }, foreign, [{ $ifNull: [foreign, null] }]] },
          {
            $cond: [
              { $isArray: local },
              {
                $cond: [
                  eq({ $size: { $cond: [{ $isArray: local }, local, []] } }, 0),
                  [null],
                  local
                ]
              },
              [{ $ifNull: [local, null] }]
            ]
          }
        ]
      }
    },
    0
  ]
})

const rewriteStages = (pipeline: Document[], context: Context): Document[] => {
  if (!Array.isArray(pipeline)) return fail('pipeline')
  return pipeline.map((inputStage) => {
    const stage = cloneDeep(inputStage)
    if (!object(stage) || Object.keys(stage).length !== 1) return fail('stage shape')
    const [name, value] = Object.entries(stage)[0]
    if (!safeStages.has(name)) return fail(`stage ${name}`)
    assertNoExecutableExpressions(value)
    if (name === '$facet') {
      if (!object(value)) return fail('facet')
      return {
        $facet: Object.fromEntries(
          Object.entries(value).map(([key, branch]) => [
            key,
            rewriteStages(branch, context)
          ])
        )
      }
    }
    if (name === '$unionWith') {
      const collName = typeof value === 'string' ? value : value?.coll
      if (typeof collName !== 'string') return fail('union collection')
      return {
        $unionWith: {
          coll: collName,
          pipeline: buildAuthorizedReadPipeline({
            ...context,
            collName,
            pipeline: typeof value === 'string' ? [] : (value.pipeline ?? [])
          })
        }
      }
    }
    if (name === '$lookup') {
      if (
        !object(value) ||
        typeof value.from !== 'string' ||
        typeof value.as !== 'string'
      )
        return fail('lookup')
      const { localField, foreignField, ...lookup } = value
      const foreignContext = { ...context, collName: value.from }
      const guarded = guardedStages(foreignContext)
      const caller = rewriteStages(value.pipeline ?? [], foreignContext)
      if (typeof localField !== 'undefined' || typeof foreignField !== 'undefined') {
        if (typeof localField !== 'string' || typeof foreignField !== 'string')
          return fail('lookup join paths')
        documentPath(localField)
        documentPath(foreignField)
        const variables = { ...(value.let ?? {}) }
        let variable = 'flowerbaseJoinValue'
        while (Object.prototype.hasOwnProperty.call(variables, variable)) variable += 'x'
        variables[variable] = `$${localField}`
        return {
          $lookup: {
            ...lookup,
            let: variables,
            pipeline: [
              ...guarded,
              { $match: { $expr: joinPredicate(`$${foreignField}`, `$$${variable}`) } },
              ...caller
            ]
          }
        }
      }
      return { $lookup: { ...lookup, pipeline: [...guarded, ...caller] } }
    }
    return stage
  })
}

export const buildAuthorizedReadPipeline = ({
  pipeline,
  ...context
}: Context & { pipeline: Document[] }): Document[] => [
  ...guardedStages(context),
  ...rewriteStages(pipeline, context)
]

export const rewriteAuthorizedReadStages = (
  pipeline: Document[],
  context: Context
): Document[] => rewriteStages(pipeline, context)
