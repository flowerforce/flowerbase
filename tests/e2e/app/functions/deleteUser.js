module.exports = async function (payload) {
  const authService = context.services.get('auth')
  const result = await authService.emailPasswordAuth.deleteUser({
    id: payload?.id,
    email: payload?.email
  })

  return {
    deletedCount: result?.deletedCount ?? 0
  }
}
