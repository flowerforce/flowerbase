import { evaluateExpression } from '../roles/helpers'
import { Params, Role } from '../roles/interface'
import { evaluateTopLevelReadFn } from '../roles/machines/read/C/validators'

jest.mock('../roles/helpers', () => ({
  evaluateExpression: jest.fn()
}))

const mockedRole = {} as Role

const mockUser = {}
const mockParams = {
  type: 'read'
} as Params

describe('evaluateTopLevelReadFn', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should return false if type is different from read', async () => {
    const isValid = await evaluateTopLevelReadFn({
      role: mockedRole,
      user: mockUser,
      params: { type: 'write' } as Params
    })
    expect(isValid).toBe(false)
    expect(evaluateExpression).not.toHaveBeenCalled()
  })
  it('should return undefined if type is read and role read is not defined', async () => {
    const isValid = await evaluateTopLevelReadFn({
      role: mockedRole,
      user: mockUser,
      params: mockParams
    })
    expect(isValid).toBe(undefined)
    expect(evaluateExpression).not.toHaveBeenCalled()
  })
  it('should return false if type is read and role read defined but evaluate expression returns false', async () => {
    (evaluateExpression as jest.Mock).mockResolvedValueOnce(false)
    const isValid = await evaluateTopLevelReadFn({
      role: { ...mockedRole, read: false },
      user: mockUser,
      params: mockParams
    })
    expect(isValid).toBe(false)
    expect(evaluateExpression).toHaveBeenCalledWith(mockParams, false, mockUser)
  })
  it('should return true if type is read and role read defined and evaluate expression returns true', async () => {
    (evaluateExpression as jest.Mock).mockResolvedValueOnce(true)
    const isValid = await evaluateTopLevelReadFn({
      role: { ...mockedRole, read: false },
      user: mockUser,
      params: mockParams
    })
    expect(isValid).toBe(true)
    expect(evaluateExpression).toHaveBeenCalledWith(mockParams, false, mockUser)
  })
})
