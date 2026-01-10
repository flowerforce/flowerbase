module.exports = async function (doc) {
  if (!doc || !context?.user?.id) {
    return false
  }

  return doc.userId === context.user.id
}
