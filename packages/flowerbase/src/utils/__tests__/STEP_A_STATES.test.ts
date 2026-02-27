import { evaluateTopLevelPermissionsFn } from '../roles/machines/commonValidators'
import { MachineContext } from '../roles/machines/interface'
import { STEP_A_STATES } from '../roles/machines/read/A'
import * as Utils from '../roles/machines/utils'
const { evaluateSearch, checkSearchRequest } = STEP_A_STATES

jest.mock('../roles/machines/commonValidators', () => ({
  evaluateTopLevelPermissionsFn: jest.fn()
}))

const endValidation = jest.fn()
const goToNextValidationStage = jest.fn()
const next = jest.fn()

describe('STEP_A_STATES', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('checkSearchRequest should go to evaluateSearch if is a search operation', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    const mockContext = {
      params: {
        type: 'search'
      },
      role: {
        name: 'test'
      }
    } as MachineContext
    await checkSearchRequest({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateSearch')
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'A',
      step: 1,
      stepName: 'checkSearchRequest'
    })
    mockedLogInfo.mockRestore()
  })
  it('checkSearchRequest should go to next stage if operation is not search', async () => {
    const mockContext = {
      params: {
        type: 'read'
      },
      role: {
        name: 'test'
      }
    } as MachineContext
    await checkSearchRequest({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(goToNextValidationStage).toHaveBeenCalled()
  })
  it('evaluateSearch should go to next validation stage when search is allowed', async () => {
    (evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(true)
    const mockContext = {
      role: {
        name: 'test'
      }
    } as MachineContext
    await evaluateSearch({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(goToNextValidationStage).toHaveBeenCalled()
  })
  it('evaluateSearch should end a failed validation when search is denied', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
      ; (evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(false)
    const mockContext = {
      role: {
        name: 'test'
      }
    } as MachineContext
    await evaluateSearch({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'A',
      step: 2,
      stepName: 'evaluateSearch'
    })
    mockedLogInfo.mockRestore()
  })
})
