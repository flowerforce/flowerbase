import { EJSON } from 'bson'
import { ObjectId } from 'mongodb'
import { Function, Functions } from '../../features/functions/interface'
import { FunctionsQueue } from '../../features/functions/queue'
import { StateManager } from '../../state'
import { Services } from '../../services/interface'
import { GenerateContext } from '../context'

describe('GenerateContext with function using EJSON', () => {
  beforeEach(() => {
    StateManager.setData('functionsQueue', new FunctionsQueue())
  })

  it('runs a function that uses EJSON in the sandbox', async () => {
    const objectId = new ObjectId('65b7f1c5e1c6d44f8a1b2c3d')
    const createdAt = new Date('2025-01-01T00:00:00.000Z')

    const currentFunction: Function = {
      code: `
        module.exports = (doc) => {
          return EJSON.serialize({ _id: doc._id, createdAt: doc.createdAt })
        }
      `
    }

    const functionsList: Functions = {
      usesEjson: currentFunction
    }

    const services: Services = {
      api: jest.fn().mockReturnValue({}),
      aws: jest.fn().mockReturnValue({}),
      auth: jest.fn().mockReturnValue({}),
      'mongodb-atlas': jest.fn().mockReturnValue({})
    } as unknown as Services

    const result = await GenerateContext({
      args: [EJSON.serialize({ _id: objectId, createdAt })],
      app: {} as any,
      rules: {},
      user: {},
      currentFunction,
      functionsList,
      services
    })

    expect(result).toEqual({
      _id: { $oid: objectId.toHexString() },
      createdAt: { $date: '2025-01-01T00:00:00Z' }
    })
  })
})
