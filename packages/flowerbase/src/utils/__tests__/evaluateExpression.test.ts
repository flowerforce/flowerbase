import { evaluateExpression } from '../roles/helpers'
import { Params } from '../roles/interface'
import { GenerateContext } from '../context'
import { StateManager } from '../../state'

jest.mock('../context', () => ({
  GenerateContext: jest.fn()
}))

jest.mock('../../state', () => ({
  StateManager: {
    select: jest.fn()
  }
}))

jest.mock('../../services', () => ({
  services: {}
}))

const mockedGenerateContext = jest.mocked(GenerateContext)
const mockedSelect = jest.mocked(StateManager.select)

describe('evaluateExpression', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedSelect.mockImplementation(((key: string) => {
      switch (key) {
        case 'functions':
          return {
            checkAccess: {
              name: 'checkAccess'
            }
          }
        case 'app':
          return {
            id: 'app-id'
          }
        case 'rules':
          return {}
        default:
          return undefined
      }
    }) as never)
  })

  it('supports insert-only write expressions that rely on %%prevRoot', async () => {
    const expression = {
      '%%prevRoot': {
        '%exists': false
      }
    }

    const insertParams = {
      type: 'insert',
      cursor: { title: 'new doc' },
      expansions: {
        '%%prevRoot': undefined
      },
      roles: []
    } as Params

    const readParams = {
      type: 'read',
      cursor: { _id: 'doc-1', title: 'existing doc' },
      expansions: {
        '%%prevRoot': { _id: 'doc-1', title: 'existing doc' }
      },
      roles: []
    } as Params

    await expect(evaluateExpression(insertParams, expression)).resolves.toBe(true)
    await expect(evaluateExpression(readParams, expression)).resolves.toBe(false)
  })

  it('supports nested %function conditions inside %or/%and expressions', async () => {
    mockedGenerateContext.mockResolvedValue(true)

    const expression = {
      '%or': [
        {
          '%%root.company': 'company-1'
        },
        {
          '%and': [
            {
              '%%user.custom_data.type': 'customer'
            },
            {
              '%%true': {
                '%function': {
                  name: 'checkAccess',
                  arguments: ['%%root.company']
                }
              }
            }
          ]
        }
      ]
    }

    const params = {
      type: 'read',
      cursor: { company: 'company-2' },
      expansions: {},
      roles: []
    } as Params

    const user = {
      custom_data: {
        type: 'customer'
      }
    }

    await expect(evaluateExpression(params, expression, user as never)).resolves.toBe(true)
    expect(mockedGenerateContext).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ['company-2'],
        functionName: 'checkAccess'
      })
    )
  })
})
