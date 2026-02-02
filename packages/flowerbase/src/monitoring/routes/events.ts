import type { FastifyInstance } from 'fastify'
import type { EventStore } from '../utils'

export type EventsRoutesDeps = {
  prefix: string
  eventStore: EventStore
  getStats: () => {
    ramMb: number
    cpuPercent: number
    topRamMb: number
    topCpuPercent: number
    uptimeSec: number
  }
}

export const registerEventsRoutes = (app: FastifyInstance, deps: EventsRoutesDeps) => {
  const { prefix, eventStore, getStats } = deps

  app.get(`${prefix}/api/events`, async (req) => {
    const query = req.query as { q?: string; type?: string; limit?: string }
    const limit = query.limit ? Number(query.limit) : undefined
    return {
      items: eventStore.list({
        q: query.q,
        type: query.type,
        limit
      })
    }
  })

  app.get(`${prefix}/api/stats`, async () => getStats())
}
