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
})
