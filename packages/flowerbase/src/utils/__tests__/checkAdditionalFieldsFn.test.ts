import { Params } from '../roles/interface'
import { checkAdditionalFieldsFn } from '../roles/machines/read/D/validators'

const mockedRole = {
  name: 'mock',
  apply_when: {}
}
const additionalFields = {
  name: {
    write: true
  }
}

const mockUser = {}
const mockParams = {} as Params

describe('comparePassword', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('should return true for existing additional fields', () => {
    const isDefined = checkAdditionalFieldsFn({
      role: { ...mockedRole, additional_fields: additionalFields },
      user: mockUser,
      params: mockParams
    })
    expect(isDefined).toBe(true)
  })
  it('should return false for missing additional fields', () => {
    const isDefined = checkAdditionalFieldsFn({
      role: mockedRole,
      user: mockUser,
      params: mockParams
    })
    expect(isDefined).toBe(false)
  })
  it('should return false for empty additional fields', () => {
    const isDefined = checkAdditionalFieldsFn({
      role: { ...mockedRole, additional_fields: {} },
      user: mockUser,
      params: mockParams
    })
    expect(isDefined).toBe(false)
  })
})
