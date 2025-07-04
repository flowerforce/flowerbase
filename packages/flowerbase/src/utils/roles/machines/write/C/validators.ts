import { MachineContext } from '../../interface'

export const checkAdditionalFieldsFn = ({ role }: MachineContext) => {
  return !!Object.keys(role.additional_fields || {}).length
}

export const checkIsValidFieldNameFn = ({ role, params }: MachineContext) => {
  const { cursor } = params

  const { fields = {}, additional_fields = {} } = role
  const rulesOnId = !!(fields['_id'] || additional_fields['_id'])
  const filteredDocument = Object.entries(cursor).reduce(
    (filteredDocument, [key, value]) => {
      if (fields![key]) {
        return role.fields![key].write
          ? { ...filteredDocument, [key]: value }
          : filteredDocument
      }
      if (additional_fields[key]) {
        return additional_fields[key]?.write
          ? { ...filteredDocument, [key]: value }
          : filteredDocument
      }
      return { ...filteredDocument, [key]: value }
    },
    {}
  )

  return rulesOnId || cursor._id === undefined
    ? filteredDocument
    : { ...filteredDocument, _id: cursor._id }
}
