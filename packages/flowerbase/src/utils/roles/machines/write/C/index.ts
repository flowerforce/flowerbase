import { States } from '../../interface'
import { logMachineInfo } from '../../utils'
import { checkAdditionalFieldsFn, checkIsValidFieldNameFn } from './validators'

export const STEP_C_STATES: States = {
  checkAdditionalFields: async ({ context, next, endValidation }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'C',
      step: 1,
      stepName: 'checkAdditionalFields'
    })
    const check = checkAdditionalFieldsFn(context)
    return check ? next('checkIsValidFieldName') : endValidation({ success: false })
  },
  checkIsValidFieldName: async ({ context, endValidation }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'D',
      step: 2,
      stepName: 'checkIsValidFieldName'
    })
    const document = checkIsValidFieldNameFn(context)
    return endValidation({ success: !!Object.keys(document).length, document })
  }
}
