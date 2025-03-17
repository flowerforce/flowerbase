import { someAsync } from "../../../../helpers/someAsync"
import { evaluateExpression } from "../../../helpers"
import { MachineContext } from "../../interface"

const readOnly = ['read']
const readWrite = ['write', 'delete', 'insert', ...readOnly]


export const evaluateDocumentFiltersWriteFn = ({ params, role, user }: MachineContext) => {
  return someAsync([
    readWrite.includes(params.type) && role.document_filters?.write
  ]
    .filter(Boolean), async (expr) => evaluateExpression(params, expr, user))
}

export const evaluateTopLevelInsertFn = ({ params, role, user }: MachineContext) => {
  return someAsync([
    readWrite.includes(params.type) && role.document_filters?.insert
  ]
    .filter(Boolean), async (expr) => evaluateExpression(params, expr, user))
}

export const evaluateTopLevelDeleteFn = ({ params, role, user }: MachineContext) => {
  return someAsync([
    readWrite.includes(params.type) && role.document_filters?.delete
  ]
    .filter(Boolean), async (expr) => evaluateExpression(params, expr, user))
}

export const checkFieldsPropertyExists = ({ role }: MachineContext) => {
  return !!Object.keys(role.fields ?? {}).length
}

export const evaluateTopLevelWriteFn = async ({ params, role, user }: MachineContext) => {
  const { type } = params
  if (type === 'read' || type === "write") {
    return await evaluateExpression(params, role.write, user)
  }
}