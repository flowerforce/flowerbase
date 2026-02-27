import { MachineContext } from '../../interface'
import {
  checkFieldsPropertyExists,
  evaluateTopLevelPermissionsFn
} from '../../commonValidators'

export const evaluateTopLevelReadFn = async (context: MachineContext) => {
  if (!['read', 'search'].includes(context.params.type)) {
    return false
  }
  return evaluateTopLevelPermissionsFn(context, 'read')
}

export const evaluateTopLevelWriteFn = async (context: MachineContext) => {
  if (!['read', 'search', 'write'].includes(context.params.type)) {
    return undefined
  }
  return evaluateTopLevelPermissionsFn(context, 'write')
}

export { checkFieldsPropertyExists } from '../../commonValidators'
