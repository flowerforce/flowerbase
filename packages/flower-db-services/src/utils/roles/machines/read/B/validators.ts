import { someAsync } from "../../../../helpers/someAsync"
import { evaluateExpression } from "../../../helpers"
import { MachineContext } from "../../interface"

const readOnly = ['read']

export const evaluateDocumentFiltersReadFn = async ({ params, role, user }: MachineContext) => {
  return await someAsync([
    readOnly.includes(params.type) && role.document_filters?.read
  ]
    .filter(Boolean), async (expr) => evaluateExpression(params, expr, user))
}


