import { evaluateExpression } from '../roles/helpers'
import { Params } from '../roles/interface'

describe('evaluateExpression', () => {
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
})
