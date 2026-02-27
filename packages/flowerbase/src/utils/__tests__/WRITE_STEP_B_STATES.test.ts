import { MachineContext } from '../roles/machines/interface'
import { STEP_B_STATES } from '../roles/machines/write/B'
import {
  checkFieldsPropertyExists,
  evaluateTopLevelPermissionsFn
} from '../roles/machines/commonValidators'

const {
  checkDeleteRequest,
  evaluateTopLevelDelete,
  evaluateTopLevelWrite,
  evaluateTopLevelInsert,
  checkFieldsProperty
} = STEP_B_STATES

jest.mock('../roles/machines/commonValidators', () => ({
  checkFieldsPropertyExists: jest.fn(),
  evaluateTopLevelPermissionsFn: jest.fn()
}))

const endValidation = jest.fn()
const goToNextValidationStage = jest.fn()
const next = jest.fn()

describe('WRITE STEP_B_STATES', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('routes delete requests to evaluateTopLevelDelete', async () => {
    const context = { params: { type: 'delete' } } as MachineContext
    await checkDeleteRequest({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelDelete')
  })

  it('routes non-delete requests to evaluateTopLevelWrite', async () => {
    const context = { params: { type: 'write' } } as MachineContext
    await checkDeleteRequest({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelWrite')
  })

  it('allows delete only when top-level delete is true', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(true)
    const context = {} as MachineContext
    await evaluateTopLevelDelete({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
  })

  it('denies delete when top-level delete is false/undefined', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(undefined)
    const context = {} as MachineContext
    await evaluateTopLevelDelete({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
  })

  it('allows write when write=true and no field-level rules are defined', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(true)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(false)
    const context = {} as MachineContext
    await evaluateTopLevelWrite({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
  })

  it('routes to field-level checks when write=true and field-level rules exist', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(true)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(true)
    const context = {} as MachineContext
    await evaluateTopLevelWrite({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('checkFieldsProperty')
  })

  it('denies when write=false', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(false)
    const context = {} as MachineContext
    await evaluateTopLevelWrite({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
  })

  it('routes to insert check when write is undefined', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(undefined)
    const context = {} as MachineContext
    await evaluateTopLevelWrite({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('evaluateTopLevelInsert')
  })

  it('denies insert when insert is false/undefined', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(false)
    const context = {} as MachineContext
    await evaluateTopLevelInsert({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: false })
  })

  it('allows insert when insert=true and no field-level rules are defined', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(true)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(false)
    const context = {} as MachineContext
    await evaluateTopLevelInsert({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(endValidation).toHaveBeenCalledWith({ success: true })
  })

  it('routes insert to field-level checks when rules exist', async () => {
    ;(evaluateTopLevelPermissionsFn as jest.Mock).mockResolvedValueOnce(true)
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(true)
    const context = {} as MachineContext
    await evaluateTopLevelInsert({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(next).toHaveBeenCalledWith('checkFieldsProperty')
  })

  it('routes checkFieldsProperty to checkIsValidFieldName when field rules exist', async () => {
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(true)
    const context = {} as MachineContext
    await checkFieldsProperty({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(goToNextValidationStage).toHaveBeenCalledWith('checkIsValidFieldName')
  })

  it('routes checkFieldsProperty to checkAdditionalFields when no field rules exist', async () => {
    ;(checkFieldsPropertyExists as jest.Mock).mockReturnValue(false)
    const context = {} as MachineContext
    await checkFieldsProperty({
      context,
      endValidation,
      goToNextValidationStage,
      next,
      initialStep: null
    })
    expect(goToNextValidationStage).toHaveBeenCalledWith('checkAdditionalFields')
  })
})
