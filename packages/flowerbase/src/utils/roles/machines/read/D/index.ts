import { Document } from 'mongodb'
import { MachineContext, States } from '../../interface'
import { logMachineInfo } from '../../utils'
import { checkAdditionalFieldsFn, checkIsValidFieldNameFn } from './validators'

const runCheckIsValidFieldName = async ({
  context,
  endValidation
}: {
  context: MachineContext
  endValidation: ({ success, document }: { success: boolean; document?: Document }) => void
}) => {
  logMachineInfo({
    enabled: context.enableLog,
    machine: 'D',
    step: 2,
    stepName: 'checkIsValidFieldName'
  })
  const document = checkIsValidFieldNameFn(context)
  return endValidation({ success: !!Object.keys(document).length, document })
}

export const STEP_D_STATES: States = {
  checkAdditionalFields: async ({ context, next, endValidation }) => {
    logMachineInfo({
      enabled: context.enableLog,
      machine: 'D',
      step: 1,
      stepName: 'checkAdditionalFields'
    })
    const check = checkAdditionalFieldsFn(context)
    return check ? next('evaluateRead') : endValidation({ success: false })
  },
  evaluateRead: runCheckIsValidFieldName,
  checkIsValidFieldName: runCheckIsValidFieldName
}
