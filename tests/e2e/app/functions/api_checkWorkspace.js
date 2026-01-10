module.exports = (request, response) => {
  const workspace = request?.query?.workspace ?? 'default'
  response.setStatusCode(202)
  response.setBody({
    success: true,
    workspace,
    source: 'api_checkWorkspace'
  })
}
