import { States } from '../../interface'
import { logMachineInfo } from '../../utils'
import {
  checkFieldsPropertyExists,
  evaluateTopLevelReadFn,
  evaluateTopLevelWriteFn
} from './validators'

export const STEP_C_STATES: States = {
  evaluateTopLevelRead: async ({ context, next }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'C',
      step: 1,
      stepName: 'evaluateTopLevelRead'
    })
    const check = await evaluateTopLevelReadFn(context)
    return next('evaluateTopLevelWrite', { readCheck: check })
  },
  evaluateTopLevelWrite: async ({ context, next, endValidation }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'C',
      step: 2,
      stepName: 'evaluateTopLevelWrite'
    })
    const writeCheck = await evaluateTopLevelWriteFn(context)
    const readCheck = context?.prevParams?.readCheck

    if (readCheck === true || writeCheck === true) {
      return checkFieldsPropertyExists(context)
        ? next('checkFieldsProperty')
        : endValidation({ success: true })
    }

    if (readCheck === false) return endValidation({ success: false })
    return checkFieldsPropertyExists(context)
      ? next('checkFieldsProperty')
      : endValidation({ success: false })
  },
  checkFieldsProperty: async ({ context, goToNextValidationStage }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'C',
      step: 3,
      stepName: 'checkFieldsProperty'
    })
    return goToNextValidationStage('checkIsValidFieldName')
  }
}
