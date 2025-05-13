import { evaluateDocumentFiltersFn } from '../../commonValidators'
import { States } from '../../interface'
import { logMachineInfo } from '../../utils'

export const STEP_A_STATES: States = {
  checkDocumentsFilters: async ({ context, next, goToNextValidationStage }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'A',
      step: 1,
      stepName: 'checkDocumentsFilters'
    })
    const { role } = context
    if (role.document_filters) {
      return next('evaluateDocumentsFiltersWrite')
    }
    return goToNextValidationStage()
  },
  evaluateDocumentsFiltersWrite: async ({
    context,
    endValidation,
    goToNextValidationStage
  }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'B',
      step: 2,
      stepName: 'evaluateDocumentsFiltersWrite'
    })
    const check = await evaluateDocumentFiltersFn(context, 'write')
    return check ? goToNextValidationStage() : endValidation({ success: false })
  }
}
