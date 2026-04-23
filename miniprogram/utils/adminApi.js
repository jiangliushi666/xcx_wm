function callAdminApi(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'adminOps',
    data: {
      action,
      ...data
    }
  }).then(res => res.result || {})
}

module.exports = {
  callAdminApi
}
