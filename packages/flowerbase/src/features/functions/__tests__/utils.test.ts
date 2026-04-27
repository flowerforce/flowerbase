import { executeQuery } from '../utils'

describe('executeQuery', () => {
  it('passes parsed options to updateOne', async () => {
    const currentMethod = jest.fn().mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
      upsertedCount: 1
    })

    const operators = await executeQuery({
      currentMethod,
      query: { ownerUserId: 'user-1' },
      update: {
        $set: { locale: 'it-IT' },
        $setOnInsert: { scope: 'workspace' }
      },
      options: { upsert: true }
    } as any)

    await operators.updateOne()

    expect(currentMethod).toHaveBeenCalledWith(
      { ownerUserId: 'user-1' },
      {
        $set: { locale: 'it-IT' },
        $setOnInsert: { scope: 'workspace' }
      },
      { upsert: true }
    )
  })

  it('passes distinct arguments through to the service method', async () => {
    const currentMethod = jest.fn().mockResolvedValue(['open'])

    const operators = await executeQuery({
      currentMethod,
      key: 'status',
      query: { archived: false },
      update: {},
      options: { maxTimeMS: 500 }
    } as any)

    await operators.distinct()

    expect(currentMethod).toHaveBeenCalledWith(
      'status',
      { archived: false },
      { maxTimeMS: 500 }
    )
  })

  it('passes bulkWrite operations through to the service method', async () => {
    const currentMethod = jest.fn().mockResolvedValue({ acknowledged: true })
    const operations = [
      {
        updateOne: {
          filter: { archived: false },
          update: { $set: { archived: true } }
        }
      }
    ]

    const operators = await executeQuery({
      currentMethod,
      query: {},
      update: {},
      operations,
      options: { ordered: false }
    } as any)

    await operators.bulkWrite()

    expect(currentMethod).toHaveBeenCalledWith(operations, { ordered: false })
  })
})
