import {
  checkFieldsPropertyExists,
  evaluateTopLevelReadFn,
  evaluateTopLevelWriteFn
} from './validators'
import { States } from '../../interface'
import { logMachineInfo } from '../../utils'

export const STEP_C_STATES: States = {
  evaluateTopLevelRead: async ({ context, next, endValidation }) => {
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
    const readCheck = context?.prevParams?.readCheck === true
    if (!readCheck && !writeCheck) return endValidation({ success: false })
    return checkFieldsPropertyExists(context)
      ? next('checkFieldsProperty')
      : endValidation({ success: true })
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
