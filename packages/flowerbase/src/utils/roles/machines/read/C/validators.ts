import { MachineContext } from '../../interface'
import {
  checkFieldsPropertyExists,
  evaluateTopLevelPermissionsFn
} from '../../commonValidators'

export const evaluateTopLevelReadFn = async (context: MachineContext) => {
  if (context.params.type !== 'read') {
    return false
  }
  return evaluateTopLevelPermissionsFn(context, 'read')
}

export const evaluateTopLevelWriteFn = async (context: MachineContext) => {
  if (!['read', 'write'].includes(context.params.type)) {
    return undefined
  }
  return evaluateTopLevelPermissionsFn(context, 'write')
}

export { checkFieldsPropertyExists } from '../../commonValidators'
