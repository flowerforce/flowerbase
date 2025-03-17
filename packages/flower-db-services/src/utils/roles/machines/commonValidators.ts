import { someAsync } from "../../helpers/someAsync"
import { evaluateExpression } from "../helpers"
import { MachineContext } from "./interface"

const readWrite = ['write', 'delete', 'insert', 'read']

export const evaluateDocumentFiltersWriteFn = ({ params, role, user }: MachineContext) => {
    return someAsync([
        readWrite.includes(params.type) && role.document_filters?.write
    ].filter(Boolean), async (expr) => evaluateExpression(params, expr, user))
}
