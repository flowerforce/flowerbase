module.exports = async function (payload) {
  const authService = context.services.get('auth')
  const result = await authService.emailPasswordAuth.registerUser({
    email: payload?.email,
    password: payload?.password
  })

  return {
    insertedId: result?.insertedId?.toString?.() ?? null
  }
}
