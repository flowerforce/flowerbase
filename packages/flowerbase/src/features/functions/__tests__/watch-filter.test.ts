import { ObjectId } from 'mongodb'
import {
  mapWatchFilterToChangeStreamMatch,
  mapWatchFilterToDocumentQuery,
  shouldSkipReadabilityLookupForChange
} from '../controller'

describe('watch filter mapping', () => {
  it('keeps change-event fields untouched and prefixes only document fields', () => {
    const input = {
      accountId: '699efbc09729e3b79f79e9b4',
      $and: [
        {
          $or: [
            { requestId: '69a282a75cd849c244e001ca' },
            { 'fullDocument.requestId': '69a282a75cd849c244e001ca' }
          ]
        },
        {
          $or: [
            { operationType: 'insert' },
            { operationType: 'replace' },
            {
              operationType: 'update',
              'updateDescription.updatedFields.stage': { $exists: true }
            }
          ]
        }
      ]
    }

    const output = mapWatchFilterToChangeStreamMatch(input)

    expect(output).toEqual({
      'fullDocument.accountId': '699efbc09729e3b79f79e9b4',
      $and: [
        {
          $or: [
            { 'fullDocument.requestId': '69a282a75cd849c244e001ca' },
            { 'fullDocument.requestId': '69a282a75cd849c244e001ca' }
          ]
        },
        {
          $or: [
            { operationType: 'insert' },
            { operationType: 'replace' },
            {
              operationType: 'update',
              'updateDescription.updatedFields.stage': { $exists: true }
            }
          ]
        }
      ]
    })

    const outputJson = JSON.stringify(output)
    expect(outputJson).not.toContain('fullDocument.fullDocument.')
    expect(outputJson).not.toContain('fullDocument.operationType')
  })

  it('supports stage-change filters and strips event-only clauses for document readability checks', () => {
    const input = {
      'fullDocument.accountId': '699efbc09729e3b79f79e9b4',
      $and: [
        {
          $or: [
            { 'fullDocument.requestId': '69a282a75cd849c244e001ca' },
            { 'fullDocument.requestId': '69a282a75cd849c244e001ca' }
          ]
        },
        {
          $or: [
            { operationType: 'insert' },
            { operationType: 'replace' },
            {
              operationType: 'update',
              'updateDescription.updatedFields.stage': { $exists: true }
            }
          ]
        }
      ]
    }

    const watchMatch = mapWatchFilterToChangeStreamMatch(input)
    expect(watchMatch).toEqual(input)

    const documentQuery = mapWatchFilterToDocumentQuery(input)
    expect(documentQuery).toEqual({
      accountId: '699efbc09729e3b79f79e9b4',
      $and: [
        {
          $or: [
            { requestId: '69a282a75cd849c244e001ca' },
            { requestId: '69a282a75cd849c244e001ca' }
          ]
        }
      ]
    })

    const documentQueryJson = JSON.stringify(documentQuery)
    expect(documentQueryJson).not.toContain('operationType')
    expect(documentQueryJson).not.toContain('updateDescription')
  })

  it('preserves ObjectId values in both change-stream and document mappings', () => {
    const id = new ObjectId('69a282a75cd849c244e001ca')
    const input = {
      'fullDocument._id': id,
      operationType: 'update',
      'updateDescription.updatedFields.stage': { $exists: true }
    }

    const watchMatch = mapWatchFilterToChangeStreamMatch(input) as Record<string, unknown>
    expect(watchMatch['fullDocument._id']).toEqual(id)

    const documentQuery = mapWatchFilterToDocumentQuery(input) as Record<string, unknown>
    expect(documentQuery._id).toEqual(id)
    expect(documentQuery.operationType).toBeUndefined()
  })

  it('skips readability lookup only for delete change events', () => {
    expect(shouldSkipReadabilityLookupForChange({ operationType: 'delete' } as any)).toBe(true)
    expect(shouldSkipReadabilityLookupForChange({ operationType: 'update' } as any)).toBe(false)
    expect(shouldSkipReadabilityLookupForChange({ operationType: 'insert' } as any)).toBe(false)
  })
})
