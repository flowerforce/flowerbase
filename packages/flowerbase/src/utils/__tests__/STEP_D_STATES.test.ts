import { Role } from '../roles/interface'
import { MachineContext } from '../roles/machines/interface'
import { STEP_D_STATES } from '../roles/machines/read/D'
import * as Utils from '../roles/machines/utils'
const { checkAdditionalFields, checkIsValidFieldName } = STEP_D_STATES

const endValidation = jest.fn()
const goToNextValidationStage = jest.fn()
const next = jest.fn()

describe('STEP_D_STATES', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  it('checkAdditionalFields should end validation if additional fields is not defined', () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    const mockContext = {
      role: {
        name: 'test'
      }
    } as MachineContext
    checkAdditionalFields({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'D',
      step: 1,
      stepName: 'checkAdditionalFields'
    })
    mockedLogInfo.mockRestore()
  })
  it('checkAdditionalFields should end validation if additional fields are empty', () => {
    const mockContext = {
      role: {
        name: 'test',
        additional_fields: {}
      }
    } as MachineContext
    checkAdditionalFields({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
  })
  it('checkAdditionalFields should go to evaluateRead step if additional fields are defined and not empty', () => {
    const mockContext = {
      role: {
        name: 'test',
        apply_when: {
          '%%true': true
        },
        additional_fields: {
          name: {
            write: true
          }
        }
      } as Role
    } as MachineContext
    checkAdditionalFields({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateRead')
  })
  it('checkIsValidFieldName should end a successful validation, with a document', async () => {
    const mockedLogInfo = jest
      .spyOn(Utils, 'logMachineInfo')
      .mockImplementation(() => 'Mocked Value')
    const mockContext = {
      params: {
        cursor: { name: 'test' }
      },
      role: {
        name: 'test'
      }
    } as MachineContext
    await checkIsValidFieldName({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true, document: { name: 'test' } })
    expect(mockedLogInfo).toHaveBeenCalledWith({
      enabled: mockContext.enableLog,
      machine: 'D',
      step: 2,
      stepName: 'checkIsValidFieldName'
    })
    mockedLogInfo.mockRestore()
  })
  it('checkIsValidFieldName should end a success validation, with  document', async () => {
    const mockContext = {
      params: {
        cursor: { name: 'test' }
      },
      role: {
        name: 'testRole',
        apply_when: {
          '%%true': true
        },
        fields: {
          name: {
            read: true
          }
        }
      } as Role
    } as MachineContext
    await checkIsValidFieldName({
      endValidation,
      context: mockContext,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({
      success: true,
      document: { name: 'test' }
    })
  })
})
