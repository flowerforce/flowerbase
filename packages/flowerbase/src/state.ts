import { FastifyInstance } from 'fastify'
import { CacheProvider, noopCacheProvider } from './cache'
import { Endpoints } from './features/endpoints/interface'
import { Functions } from './features/functions/interface'
import { FunctionsQueue } from './features/functions/queue'
import { Rules } from './features/rules/interface'
import { Triggers } from './features/triggers/interface'
import type { MonitorEvent } from './monitoring/utils'
import { Services } from './services/interface'

type State = {
  functions: Functions
  triggers: Triggers
  services?: Services
  endpoints: Endpoints
  rules: Rules
  projectId: string
  cache: CacheProvider
  app?: FastifyInstance
  functionsQueue: FunctionsQueue
  monitoring: {
    addEvent?: (event: MonitorEvent) => void
  }
}

export class StateManager {
  private static _state: State = {
    functions: {},
    triggers: [],
    endpoints: [],
    projectId: '',
    rules: {},
    cache: noopCacheProvider,
    functionsQueue: new FunctionsQueue(),
    monitoring: {}
  }
  static select<K extends keyof typeof this._state>(
    key: K
  ): NonNullable<(typeof this._state)[K]> {
    return this._state[key] as NonNullable<(typeof this._state)[K]>
  }

  static setData<K extends keyof typeof this._state>(
    key: K,
    value: (typeof this._state)[K]
  ) {
    this._state[key] = value
  }
}
