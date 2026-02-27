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

jest.mock('../roles/machines/read/C/validators', () => ({
  evaluateTopLevelReadFn: jest.fn(),
  checkFieldsPropertyExists: jest.fn(),
  evaluateTopLevelWriteFn: jest.fn()
}))

describe('STEP_C_STATES', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('evaluateTopLevelRead should pass readCheck=false to evaluateTopLevelWrite', async () => {
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
    expect(next).toHaveBeenCalledWith('evaluateTopLevelWrite', { readCheck: false })
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'C',
      step: 1,
      stepName: 'evaluateTopLevelRead'
    })
    mockedLogInfo.mockRestore()
  })
  it('evaluateTopLevelRead should pass readCheck=undefined to evaluateTopLevelWrite', async () => {
    (evaluateTopLevelReadFn as jest.Mock).mockReturnValueOnce(undefined)
    const mockContext = {} as MachineContext
    await evaluateTopLevelRead({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelWrite', { readCheck: undefined })
  })
  it('evaluateTopLevelRead should pass readCheck=true to evaluateTopLevelWrite', async () => {
    (evaluateTopLevelReadFn as jest.Mock).mockReturnValueOnce(true)
    const mockContext = {} as MachineContext
    await evaluateTopLevelRead({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelWrite', { readCheck: true })
  })
  it('checkFieldsProperty should go to next validation stage with initialStep checkIsValidFieldName', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
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
  it('evaluateTopLevelWrite should end a success validation when read is true', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    ;(evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(false)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(false)
    const mockContext = { prevParams: { readCheck: true } } as unknown as MachineContext
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
  it('evaluateTopLevelWrite should end a success validation when read is false and write is true', async () => {
    ;(evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(true)
    const mockContext = { prevParams: { readCheck: false } } as unknown as MachineContext
    await evaluateTopLevelWrite({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
  })
  it('evaluateTopLevelWrite should end a failed validation when read is false and write is not true', async () => {
    (evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(false)
    const mockContext = {
      prevParams: {
        readCheck: false
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
  it('evaluateTopLevelWrite should end a success validation when read is undefined and write is true', async () => {
    ;(evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(true)
    const mockContext = {
      prevParams: {
        readCheck: undefined
      }
    } as unknown as MachineContext
    await evaluateTopLevelWrite({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
  })
  it('evaluateTopLevelWrite should go to checkFieldsProperty when read and write are undefined/false but fields exist', async () => {
    (evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(false)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(true)
    const mockContext = {
      prevParams: {
        readCheck: undefined
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
  it('evaluateTopLevelWrite should end a failed validation when read and write are undefined/false and no field rules exist', async () => {
    ;(evaluateTopLevelWriteFn as jest.Mock).mockReturnValue(undefined)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(false)
    const mockContext = {
      prevParams: {
        readCheck: undefined
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
})
