import { MachineContext } from '../roles/machines/interface'
import { STEP_C_STATES } from '../roles/machines/read/C'
import {
  checkFieldsPropertyExists,
  evaluateTopLevelReadFn,
  evaluateTopLevelWriteFn
} from '../roles/machines/read/C/validators'
import * as Utils from '../roles/machines/utils'
const { evaluateTopLevelRead, checkFieldsProperty, evaluateTopLevelWrite } = STEP_C_STATES

const endValidation = jest.fn()
const goToNextValidationStage = jest.fn()
const next = jest.fn()

jest.mock('../roles/machines/C/validators', () => ({
  evaluateTopLevelReadFn: jest.fn(),
  checkFieldsPropertyExists: jest.fn(),
  evaluateTopLevelWriteFn: jest.fn()
}))

describe('STEP_C_STATES', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('evaluateTopLevelRead should go to evaluateTopLevelWrite if evaluateTopLevelReadFn returns false ', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    ;(evaluateTopLevelReadFn as jest.Mock).mockReturnValueOnce(false)
    const mockContext = {} as MachineContext
    await evaluateTopLevelRead({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelWrite', { check: false })
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'C',
      step: 1,
      stepName: 'evaluateTopLevelRead'
    })
    mockedLogInfo.mockRestore()
  })
  it('evaluateTopLevelRead should go to evaluateTopLevelWrite if evaluateTopLevelReadFn returns undefined ', async () => {
    (evaluateTopLevelReadFn as jest.Mock).mockReturnValueOnce(undefined)
    const mockContext = {} as MachineContext
    await evaluateTopLevelRead({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelWrite', { check: undefined })
  })
  it('evaluateTopLevelRead should endValidation validation if evaluateTopLevelReadFn returns true ', async () => {
    (evaluateTopLevelReadFn as jest.Mock).mockReturnValueOnce(true)
    const mockContext = {} as MachineContext
    await evaluateTopLevelRead({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
  })
  it('checkFieldsProperty should go to next validation stage if checkFieldsPropertyExists returns true with initialStep checkIsValidFieldName', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(true)
    const mockContext = {} as MachineContext
    await checkFieldsProperty({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(goToNextValidationStage).toHaveBeenCalledWith('checkIsValidFieldName')
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'C',
      step: 3,
      stepName: 'checkFieldsProperty'
    })
    mockedLogInfo.mockRestore()
  })
  it('checkFieldsProperty should go to next validation stage if checkFieldsPropertyExists returns fslse with initialStep checkAdditionalFields', async () => {
    (checkFieldsPropertyExists as jest.Mock).mockReturnValue(false)
    const mockContext = {} as MachineContext
    await checkFieldsProperty({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(goToNextValidationStage).toHaveBeenCalledWith('checkAdditionalFields')
  })
  it('evaluateTopLevelWrite should end a success validation if evaluateTopLevelWriteFn returns true', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    ;(evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(true)
    const mockContext = {} as MachineContext
    await evaluateTopLevelWrite({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'C',
      step: 2,
      stepName: 'evaluateTopLevelWrite'
    })
    mockedLogInfo.mockRestore()
  })
  it('evaluateTopLevelWrite should end a failed validation if evaluateTopLevelWriteFn returns false and prevParams.check is false', async () => {
    (evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(false)
    const mockContext = {
      prevParams: {
        check: false
      }
    } as unknown as MachineContext
    await evaluateTopLevelWrite({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
  })
  it('evaluateTopLevelWrite should go to next step checkFieldsProperty if evaluateTopLevelWriteFn returns false and prevParams.check is not false ', async () => {
    (evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(false)
    const mockContext = {
      prevParams: {
        check: true
      }
    } as unknown as MachineContext
    await evaluateTopLevelWrite({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('checkFieldsProperty')
  })
})
