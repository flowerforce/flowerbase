import { MachineContext } from '../../interface'
import { evaluateDocumentFiltersFn } from '../../commonValidators'

export const evaluateDocumentFiltersReadFn = (context: MachineContext) =>
  evaluateDocumentFiltersFn(context, 'read')

export const evaluateDocumentFiltersWriteFn = (context: MachineContext) =>
  evaluateDocumentFiltersFn(context, 'write')
