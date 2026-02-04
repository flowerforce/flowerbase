import type { FastifyInstance } from 'fastify'
import type { Rules } from '../../features/rules/interface'
import { services as coreServices } from '../../services'
import { StateManager } from '../../state'
import { GenerateContext } from '../../utils/context'
import { createEventId, FunctionHistoryItem, getErrorDetails, MonitorEvent, resolveUserContext, sanitize } from '../utils'

export type FunctionRoutesDeps = {
  prefix: string
  allowEdit: boolean
  allowInvoke: boolean
  maxHistory: number
  addEvent: (event: MonitorEvent) => void
  addFunctionHistory: (entry: FunctionHistoryItem) => void
  functionHistory: FunctionHistoryItem[]
}

export const registerFunctionRoutes = (app: FastifyInstance, deps: FunctionRoutesDeps) => {
  const { prefix, allowEdit, allowInvoke, maxHistory, addEvent, addFunctionHistory, functionHistory } = deps

  app.get(`${prefix}/api/functions`, async () => {
    const functionsList = StateManager.select('functions') as Record<string, { private?: boolean; run_as_system?: boolean }>
    const items = Object.keys(functionsList || {}).map((name) => ({
      name,
      private: !!functionsList[name]?.private,
      run_as_system: !!functionsList[name]?.run_as_system
    }))
    return { items }
  })

  app.get(`${prefix}/api/functions/:name`, async (req, reply) => {
    if (!allowEdit) {
      reply.code(403)
      return { error: 'Function code access disabled' }
    }
    const params = req.params as { name: string }
    const name = params.name
    const functionsList = StateManager.select('functions') as Record<
      string,
      { code?: string; private?: boolean; run_as_system?: boolean; disable_arg_logs?: boolean }
    >
    const currentFunction = functionsList?.[name]
    if (!currentFunction) {
      reply.code(404)
      return { error: `Function "${name}" not found` }
    }
    return {
      name,
      code: currentFunction.code ?? '',
      private: !!currentFunction.private,
      run_as_system: !!currentFunction.run_as_system,
      disable_arg_logs: !!currentFunction.disable_arg_logs
    }
  })

  app.get(`${prefix}/api/functions/history`, async () => ({
    items: functionHistory.slice(0, maxHistory)
  }))

  app.post(`${prefix}/api/functions/invoke`, async (req, reply) => {
    if (!allowInvoke) {
      reply.code(403)
      return { error: 'Function invocation disabled' }
    }
    const body = req.body as {
      name?: string
      arguments?: unknown[]
      runAsSystem?: boolean
      userId?: string
      user?: Record<string, unknown>
      code?: string
    }
    const name = body?.name
    const args = Array.isArray(body?.arguments) ? body.arguments : []
    if (!name) {
      reply.code(400)
      return { error: 'Missing function name' }
    }
    const functionsList = StateManager.select('functions') as Record<string, { code: string }>
    const rules = StateManager.select('rules') as Rules
    const appRef = StateManager.select('app') as FastifyInstance
    const services = StateManager.select('services') as typeof coreServices
    const currentFunction = functionsList?.[name]
    if (!currentFunction) {
      reply.code(404)
      return { error: `Function "${name}" not found` }
    }
    if (!allowEdit && typeof body?.code === 'string' && body.code.trim()) {
      reply.code(403)
      return { error: 'Function override disabled' }
    }
    const overrideCode =
      typeof body?.code === 'string' && body.code.trim()
        ? body.code
        : undefined
    const effectiveRunAsSystem = body?.runAsSystem !== false
    const effectiveFunction = overrideCode
      ? { ...currentFunction, code: overrideCode, run_as_system: effectiveRunAsSystem }
      : { ...currentFunction, run_as_system: effectiveRunAsSystem }

    const resolvedUser = await resolveUserContext(app, body?.userId, body?.user)
    const safeArgs = (Array.isArray(args) ? sanitize(args) : sanitize([args])) as unknown[]
    const resolvedUserRecord = resolvedUser as {
      id?: unknown
      email?: unknown
      user_data?: { email?: unknown }
    } | undefined
    const userInfo = resolvedUserRecord
      ? {
        id: typeof resolvedUserRecord.id === 'string' ? resolvedUserRecord.id : undefined,
        email: typeof resolvedUserRecord.email === 'string'
          ? resolvedUserRecord.email
          : (typeof resolvedUserRecord.user_data?.email === 'string'
            ? resolvedUserRecord.user_data?.email
            : undefined)
      }
      : undefined
    const codeModified = typeof overrideCode === 'string' && overrideCode !== currentFunction.code
    addFunctionHistory({
      ts: Date.now(),
      name,
      args: safeArgs,
      runAsSystem: effectiveRunAsSystem,
      user: userInfo,
      code: codeModified ? overrideCode : undefined,
      codeModified
    })

    addEvent({
      id: createEventId(),
      ts: Date.now(),
      type: 'function',
      source: 'monit',
      message: `invoke ${name}`,
      data: sanitize({
        args,
        user: userInfo,
        runAsSystem: effectiveRunAsSystem,
        override: Boolean(overrideCode),
        invokedFrom: name
      })
    })

    try {
      const result = await GenerateContext({
        args,
        app: appRef,
        rules,
        user: resolvedUser ?? { id: 'monitor', role: 'system' },
        currentFunction: effectiveFunction,
        functionName: name,
        functionsList,
        services,
        runAsSystem: effectiveRunAsSystem
      })
      return { result: sanitize(result) }
    } catch (error) {
      addEvent({
        id: createEventId(),
        ts: Date.now(),
        type: 'error',
        source: 'monit',
        message: `invoke ${name} failed`,
        data: sanitize({
          error,
          user: userInfo,
          invokedFrom: name,
          runAsSystem: effectiveRunAsSystem
        })
      })
      reply.code(500)
      const details = getErrorDetails(error)
      return { error: details.message, stack: details.stack }
    }
  })
}
