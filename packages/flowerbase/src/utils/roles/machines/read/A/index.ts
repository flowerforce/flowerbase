import { evaluateTopLevelPermissionsFn } from '../../commonValidators'
import { States } from '../../interface'
import { logMachineInfo } from '../../utils'

export const STEP_A_STATES: States = {
  checkSearchRequest: async ({ context, next, goToNextValidationStage }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'A',
      step: 1,
      stepName: 'checkSearchRequest'
    })
    if (context.params.type === 'search') {
      return next('evaluateSearch')
    }
    return goToNextValidationStage()
  },
  evaluateSearch: async ({ context, endValidation, goToNextValidationStage }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'A',
      step: 2,
      stepName: 'evaluateSearch'
    })
    const check = await evaluateTopLevelPermissionsFn(context, 'search')
    return check ? goToNextValidationStage() : endValidation({ success: false })
  }
}
