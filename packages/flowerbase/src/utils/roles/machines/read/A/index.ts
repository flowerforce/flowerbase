import { States } from '../../interface'
import { logMachineInfo } from '../../utils'

export const STEP_A_STATES: States = {
  checkSearchRequest: async ({ context, next, goToNextValidationStage }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "A", step: 1, stepName: "checkSearchRequest" })
    if (context.params.type === 'search') {
      return next('evaluateSearch')
    }
    return goToNextValidationStage()
  },
  evaluateSearch: async ({ context, endValidation }) => {
    logMachineInfo({ enabled: context.enableLog, machine: "A", step: 2, stepName: "evaluateSearch" })
    // NOTE -> we don't support search operations
    return endValidation({ success: false })
  }
}


