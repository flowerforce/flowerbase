import type { FastifyInstance } from 'fastify'
import { StateManager } from '../../state'

export type TriggerRoutesDeps = {
  prefix: string
}

export const registerTriggerRoutes = (app: FastifyInstance, deps: TriggerRoutesDeps) => {
  const { prefix } = deps

  app.get(`${prefix}/api/triggers`, async () => {
    const triggersList = StateManager.select('triggers') as { fileName: string; content: unknown }[] | undefined
    return { items: triggersList || [] }
  })
}
