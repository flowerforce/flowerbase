import { evaluateDocumentFiltersFn } from '../../commonValidators'
import { States } from '../../interface'
import { logMachineInfo } from '../../utils'

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
    const hasDocumentFiltersRead = await evaluateDocumentFiltersFn(context, "read")
    if (!hasDocumentFiltersRead) return next('evaluateDocumentsFiltersWrite')
    return goToNextValidationStage()
  },
  evaluateDocumentsFiltersWrite: async ({
    context,
    endValidation,
    goToNextValidationStage
  }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "B", step: 3, stepName: "evaluateDocumentsFiltersWrite" })
    const check = await evaluateDocumentFiltersFn(context, "write")
    return check ? goToNextValidationStage() : endValidation({ success: false })
  }
}


