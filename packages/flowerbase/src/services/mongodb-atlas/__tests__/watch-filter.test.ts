import { ObjectId } from 'mongodb'
import { toWatchMatchFilter, watchPipelineRequestsDelete } from '../index'

describe('mongodb-atlas watch filter mapping', () => {
  it('keeps change-event keys untouched and prefixes only document keys', () => {
    const input = {
      accountId: '699efbc09729e3b79f79e9b4',
      operationType: 'delete',
      $or: [
        { requestId: '69a282a75cd849c244e001ca' },
        { 'documentKey._id': '69a282a75cd849c244e001ca' }
      ]
    }

    const output = toWatchMatchFilter(input)
    expect(output).toEqual({
      'fullDocument.accountId': '699efbc09729e3b79f79e9b4',
      operationType: 'delete',
      $or: [
        { 'fullDocument.requestId': '69a282a75cd849c244e001ca' },
        { 'documentKey._id': '69a282a75cd849c244e001ca' }
      ]
    })

    const outputJson = JSON.stringify(output)
    expect(outputJson).not.toContain('fullDocument.operationType')
    expect(outputJson).not.toContain('fullDocument.documentKey.')
  })

  it('preserves ObjectId values in watch filter mapping', () => {
    const id = new ObjectId('69a282a75cd849c244e001ca')
    const input = {
      operationType: 'update',
      'documentKey._id': id,
      requestId: id
    }

    const output = toWatchMatchFilter(input) as Record<string, unknown>
    expect(output.operationType).toBe('update')
    expect(output['documentKey._id']).toEqual(id)
    expect(output['fullDocument.requestId']).toEqual(id)
  })

  it('detects delete operation requests in watch pipeline matches', () => {
    expect(
      watchPipelineRequestsDelete([
        {
          $match: {
            $or: [
              { operationType: 'insert' },
              { operationType: 'delete' }
            ]
          }
        }
      ] as any)
    ).toBe(true)

    expect(
      watchPipelineRequestsDelete([
        {
          $match: {
            operationType: { $in: ['insert', 'replace'] }
          }
        }
      ] as any)
    ).toBe(false)

    expect(
      watchPipelineRequestsDelete([
        {
          $project: {
            operationType: 1
          }
        }
      ] as any)
    ).toBe(false)
  })
})
