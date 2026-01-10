module.exports = async function ({ token, tokenId, email }) {
  if (!token || !tokenId || !email) {
    throw new Error('Missing reset params')
  }
  return { ok: true }
}
