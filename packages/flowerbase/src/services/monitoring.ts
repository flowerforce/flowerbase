import { StateManager } from '../state'
import { createEventId } from '../monitoring/utils'

type EmitServiceEventParams = {
  type: string
  source: string
  message: string
  data?: Record<string, unknown>
  error?: unknown
}

export const emitServiceEvent = ({
  type,
  source,
  message,
  data,
  error
}: EmitServiceEventParams) => {
  const monitoring = StateManager.select('monitoring')
  const addEvent = monitoring?.addEvent
  if (typeof addEvent !== 'function') return
  addEvent({
    id: createEventId(),
    ts: Date.now(),
    type: error ? 'error' : type,
    source,
    message,
    data: error ? { ...(data ?? {}), error } : data
  })
}
