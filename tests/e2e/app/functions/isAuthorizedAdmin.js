module.exports = async function (doc) {
  if (!doc || !context?.user) {
    return false
  }

  if (context.user.role === 'admin') {
    return true
  }

  const adminWorkspaces = context.user.custom_data?.adminIn ?? []
  return adminWorkspaces.includes(doc?.workspace)
}
