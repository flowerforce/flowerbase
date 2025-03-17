import { States } from '../../interface'
import { logMachineInfo } from '../../utils'
import { checkFieldsPropertyExists, evaluateTopLevelDeleteFn, evaluateTopLevelInsertFn, evaluateTopLevelWriteFn } from './validators'

export const STEP_B_STATES: States = {
  checkDeleteRequest: async ({ context, next }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 1, stepName: "checkDeleteRequest" })
    if (context.params.type === 'delete') {
      return next('evaluateTopLevelDelete')
    }
    return next('evaluateTopLevelWrite')
  },
  evaluateTopLevelDelete: async ({
    context,
    endValidation,
  }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 2, stepName: "evaluateTopLevelDelete" })
    const check = await evaluateTopLevelDeleteFn(context)
    return endValidation({ success: check })
  },
  evaluateTopLevelWrite: async ({ context, next, endValidation }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 3, stepName: "evaluateTopLevelWrite" })
    const check = await evaluateTopLevelWriteFn(context)
    if (check) return context.params.type === "insert" ? next('evaluateTopLevelInsert') : endValidation({ success: true })
    return context?.prevParams?.check === false
      ? endValidation({ success: false })
      : next('checkFieldsProperty')
  },
  checkFieldsProperty: async ({ context, goToNextValidationStage }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 4, stepName: "checkFieldsProperty" })
    const check = checkFieldsPropertyExists(context)
    return goToNextValidationStage(
      check ? 'checkIsValidFieldName' : 'checkAdditionalFields'
    )
  },
  evaluateTopLevelInsert: async ({ context, endValidation }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 5, stepName: "evaluateTopLevelInsert" })
    const check = await evaluateTopLevelInsertFn(context)
    return endValidation({ success: check })
  }
}


