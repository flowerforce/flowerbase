import { States } from '../../interface'
import { logMachineInfo } from '../../utils'
import { evaluateDocumentFiltersReadFn, evaluateDocumentFiltersWriteFn } from './validators'

export const STEP_B_STATES: States = {
  checkDocumentsFilters: async ({ context, next, goToNextValidationStage }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 1, stepName: "checkDocumentsFilters" })
    const { role } = context
    if (role.document_filters) {
      return next('evaluateDocumentsFiltersRead')
    }
    return goToNextValidationStage()
  },
  evaluateDocumentsFiltersRead: async ({ context, next, goToNextValidationStage }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 2, stepName: "evaluateDocumentsFiltersRead" })
    const hasDocumentFiltersRead = await evaluateDocumentFiltersReadFn(context)
    if (!hasDocumentFiltersRead) return next('evaluateDocumentsFiltersWrite')
    return goToNextValidationStage()
  },
  evaluateDocumentsFiltersWrite: async ({
    context,
    endValidation,
    goToNextValidationStage
  }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 3, stepName: "evaluateDocumentsFiltersWrite" })
    const check = await evaluateDocumentFiltersWriteFn(context)
    return check ? goToNextValidationStage() : endValidation({ success: false })
  }
}


