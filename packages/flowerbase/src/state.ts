import { FastifyInstance } from 'fastify'
import { Endpoints } from './features/endpoints/interface'
import { Functions } from './features/functions/interface'
import { FunctionsQueue } from './features/functions/queue'
import { Rules } from './features/rules/interface'
import { Triggers } from './features/triggers/interface'
import { Services } from './services/interface'

type State = {
  functions: Functions
  triggers: Triggers
  services?: Services
  endpoints: Endpoints
  rules: Rules
  app?: FastifyInstance
  functionsQueue: FunctionsQueue
}

export class StateManager {
  private static _state: State = {
    functions: {},
    triggers: [],
    endpoints: [],
    rules: {},
    functionsQueue: new FunctionsQueue()
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
