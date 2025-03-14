import { evaluateExpression } from "../../../helpers"
import { MachineContext } from "../../interface"

export const evaluateTopLevelReadFn = async ({ params, role, user }: MachineContext) => {
  if (params.type === 'read') {
    return role.read === undefined ? undefined : await evaluateExpression(params, role.read, user)
  }
  return false
}

export const evaluateTopLevelWriteFn = async ({ params, role, user }: MachineContext) => {
  const { type } = params
  if (type === 'read' || type === "write") {
    return await evaluateExpression(params, role.write, user)
  }
}

export const checkFieldsPropertyExists = ({ role }: MachineContext) => {
  return !!Object.keys(role.fields ?? {}).length
}