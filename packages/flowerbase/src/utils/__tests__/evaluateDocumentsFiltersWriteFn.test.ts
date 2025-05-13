import { someAsync } from '../helpers/someAsync'
import { evaluateExpression } from '../roles/helpers'
import { MachineContext } from '../roles/machines/interface'
import { evaluateDocumentFiltersWriteFn } from '../roles/machines/read/B/validators'

const mockContext = {
  params: { type: 'write' },
  role: { document_filters: { write: 'someFilterExpression' } },
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

describe('evaluateDocumentFiltersWriteFn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return true if at least one filter evaluates to true', async () => {
    (evaluateExpression as jest.Mock).mockResolvedValue(true)
    const result = await evaluateDocumentFiltersWriteFn(mockContext)
    expect(result).toBe(true)
    expect(evaluateExpression).toHaveBeenCalledWith(
      mockContext.params,
      mockContext.role.document_filters?.write,
      mockContext.user
    )
    expect(someAsync).toHaveBeenCalled()
  })

  it('should return false if no filters evaluate to true', async () => {
    (evaluateExpression as jest.Mock).mockResolvedValue(false)
    const result = await evaluateDocumentFiltersWriteFn(mockContext)
    expect(result).toBe(false)
  })

  it('should return false if type is not in valid', async () => {
    const mockClone = {
      ...mockContext,
      params: { type: 'test' as MachineContext['params']['type'] }
    } as MachineContext
    const result = await evaluateDocumentFiltersWriteFn(mockClone)
    expect(result).toBe(false)
    expect(evaluateExpression).not.toHaveBeenCalled()
  })

  it('should return false if role has no write filter', async () => {
    const mockClone = {
      ...mockContext,
      role: { ...mockContext.role, document_filters: {} }
    } as MachineContext
    const result = await evaluateDocumentFiltersWriteFn(mockClone)
    expect(result).toBe(false)
    expect(evaluateExpression).not.toHaveBeenCalled()
  })
})
