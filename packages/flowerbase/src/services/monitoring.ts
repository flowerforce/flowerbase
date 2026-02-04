import { StateManager } from '../state'
import { createEventId } from '../monitoring/utils'

type EmitServiceEventParams = {
  type: string
  source: string
  message: string
  data?: Record<string, unknown>
  error?: unknown
  origin?: string
}

export const emitServiceEvent = ({
  type,
  source,
  message,
  data,
  error,
  origin
}: EmitServiceEventParams) => {
  const monitoring = StateManager.select('monitoring')
  const addEvent = monitoring?.addEvent
  if (typeof addEvent !== 'function') return
  const withContext = origin
    ? { ...(data ?? {}), invokedFrom: origin }
    : data
  addEvent({
    id: createEventId(),
    ts: Date.now(),
    type: error ? 'error' : type,
    source,
    message,
    data: error ? { ...(withContext ?? {}), error } : withContext
  })
}
