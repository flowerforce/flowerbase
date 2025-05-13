import { someAsync } from '../helpers/someAsync'
import { evaluateExpression } from '../roles/helpers'
import { MachineContext } from '../roles/machines/interface'
import { evaluateDocumentFiltersReadFn } from '../roles/machines/read/B/validators'

const mockContext = {
  params: { type: 'read' },
  role: { document_filters: { read: 'someFilterExpression' } },
  user: { id: 'user123', name: 'Test User' }
} as unknown as MachineContext

jest.mock('../helpers/someAsync', () => ({
  someAsync: jest
    .fn()
    .mockImplementation(
      async (array: Array<unknown>, callback: (item: unknown) => Promise<boolean>) => {
        for (const item of array) {
          if (await callback(item)) return true
        }
        return false
      }
    )
}))

jest.mock('../roles/helpers', () => ({
  evaluateExpression: jest.fn()
}))

describe('evaluateDocumentFiltersReadFn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return true if at least one filter evaluates to true', async () => {
    (evaluateExpression as jest.Mock).mockResolvedValue(true)
    const result = await evaluateDocumentFiltersReadFn(mockContext)
    expect(result).toBe(true)
    expect(evaluateExpression).toHaveBeenCalledWith(
      mockContext.params,
      mockContext.role.document_filters?.read,
      mockContext.user
    )
    expect(someAsync).toHaveBeenCalled()
  })

  it('should return false if no filters evaluate to true', async () => {
    (evaluateExpression as jest.Mock).mockResolvedValue(false)
    const result = await evaluateDocumentFiltersReadFn(mockContext)
    expect(result).toBe(false)
  })

  it('should return false if role has no read filter', async () => {
    mockContext.role.document_filters = {}
    const result = await evaluateDocumentFiltersReadFn(mockContext)
    expect(result).toBe(false)
    expect(evaluateExpression).not.toHaveBeenCalled()
  })

  it('should return false if type is not in readOnly', async () => {
    mockContext.params.type = 'write'
    const result = await evaluateDocumentFiltersReadFn(mockContext)
    expect(result).toBe(false)
    expect(evaluateExpression).not.toHaveBeenCalled()
  })
})
