import { checkFieldsPropertyExists, evaluateTopLevelPermissionsFn } from '../../commonValidators'
import { States } from '../../interface'
import { logMachineInfo } from '../../utils'


export const STEP_C_STATES: States = {
  evaluateTopLevelRead: async ({ context, next, endValidation }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "C", step: 1, stepName: "evaluateTopLevelRead" })
    const check = await evaluateTopLevelPermissionsFn(context, "read")
    return check
      ? endValidation({ success: true })
      : next('evaluateTopLevelWrite', { check })
  },
  evaluateTopLevelWrite: async ({ context, next, endValidation }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "C", step: 2, stepName: "evaluateTopLevelWrite" })
    const check = await evaluateTopLevelPermissionsFn(context, "write")
    if (check) return endValidation({ success: true })
    return context?.prevParams?.check === false
      ? endValidation({ success: false })
      : next('checkFieldsProperty')
  },
  checkFieldsProperty: async ({ context, goToNextValidationStage }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "C", step: 3, stepName: "checkFieldsProperty" })
    const check = checkFieldsPropertyExists(context)
    return goToNextValidationStage(
      check ? 'checkIsValidFieldName' : 'checkAdditionalFields'
    )
  }
}

