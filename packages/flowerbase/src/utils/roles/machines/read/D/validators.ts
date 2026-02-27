import { evaluateTopLevelPermissionsFn } from '../../commonValidators'
import {
  filterDocumentByFieldPermissions,
  hasAdditionalFieldsDefined
} from '../../fieldPermissions'
import { MachineContext } from '../../interface'

export const checkAdditionalFieldsFn = ({ role }: MachineContext) => {
  return hasAdditionalFieldsDefined(role)
}

export const checkIsValidFieldNameFn = async (context: MachineContext) => {
  const readCheck = await evaluateTopLevelPermissionsFn(context, 'read')
  const writeCheck = await evaluateTopLevelPermissionsFn(context, 'write')

  return await filterDocumentByFieldPermissions(context, 'read', {
    defaultAllow: readCheck === true || writeCheck === true
  })
}
