import { someAsync } from "../../helpers/someAsync"
import { evaluateExpression } from "../helpers"
import { ReadWritePermissions } from "../interface"
import { MachineContext } from "./interface"

const readOnlyPermissions = ['read']
const readWritePermissions = ['write', 'delete', 'insert', ...readOnlyPermissions]

export const evaluateDocumentFiltersFn = async ({ params, role, user }: MachineContext, currentType: MachineContext["params"]["type"]) => {
    const permissions = currentType === "read" ? readOnlyPermissions : readWritePermissions
    return await someAsync([
        permissions.includes(params.type) && role.document_filters?.[currentType as keyof ReadWritePermissions]
    ]
        .filter(Boolean), async (expr) => evaluateExpression(params, expr, user))
}


export const evaluateTopLevelPermissionsFn = async ({ params, role, user }: MachineContext, currentType: MachineContext["params"]["type"]) => {
    return role[currentType] ? await evaluateExpression(params, role[currentType], user) : undefined
}

export const checkFieldsPropertyExists = ({ role }: MachineContext) => {
    return !!Object.keys(role.fields ?? {}).length
}
