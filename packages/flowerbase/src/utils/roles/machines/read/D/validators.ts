import {
  filterDocumentByFieldPermissions,
  hasAdditionalFieldsDefined
} from '../../fieldPermissions'
import { MachineContext } from '../../interface'

export const checkAdditionalFieldsFn = ({ role }: MachineContext) => {
  return hasAdditionalFieldsDefined(role)
}

export const checkIsValidFieldNameFn = async (context: MachineContext) =>
  await filterDocumentByFieldPermissions(context, 'read')
