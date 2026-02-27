import { activateTriggers } from '../index'
import { TRIGGER_HANDLERS } from '../utils'

jest.mock('../../../constants', () => ({
  AUTH_CONFIG: {},
  DB_NAME: 'test-db'
}))

jest.mock('../utils', () => ({
  TRIGGER_HANDLERS: {
    SCHEDULED: jest.fn(async () => {}),
    DATABASE: jest.fn(async () => {}),
    AUTHENTICATION: jest.fn(async () => {})
  }
}))

describe('activateTriggers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('skips triggers marked as disabled', async () => {
    const functionsList = {
      runEnabled: { code: 'exports = async () => {}' },
      runDisabled: { code: 'exports = async () => {}' }
    }

    await activateTriggers({
      fastify: {} as never,
      functionsList,
      triggersList: [
        {
          fileName: 'enabled-trigger.json',
          content: {
            name: 'enabled-trigger',
            type: 'SCHEDULED',
            disabled: false,
            config: { schedule: '* * * * *' },
            event_processors: {
              FUNCTION: {
                config: {
                  function_name: 'runEnabled'
                }
              }
            }
          }
        },
        {
          fileName: 'disabled-trigger.json',
          content: {
            name: 'disabled-trigger',
            type: 'SCHEDULED',
            disabled: true,
            config: { schedule: '* * * * *' },
            event_processors: {
              FUNCTION: {
                config: {
                  function_name: 'runDisabled'
                }
              }
            }
          }
        }
      ] as never
    })

    expect(TRIGGER_HANDLERS.SCHEDULED).toHaveBeenCalledTimes(1)
    expect(TRIGGER_HANDLERS.SCHEDULED).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'runEnabled',
        triggerName: 'enabled-trigger'
      })
    )
  })
})
