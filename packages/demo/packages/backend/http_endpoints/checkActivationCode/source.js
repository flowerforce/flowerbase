// This function is the webhook's request handler.
module.exports = async function (payload, response) {

   const { code } = payload.query;

   console.log("TCL: code", code)

};