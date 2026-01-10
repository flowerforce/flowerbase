const isAuthorizedUser = (doc) => {
  const user = context?.user
  if (!doc || !user) return false
  if (user.role === 'admin') return true
  return doc.ownerId === user.id
}

module.exports = isAuthorizedUser
