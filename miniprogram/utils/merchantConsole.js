function callMerchantConsole(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'merchantConsole',
    data: {
      action,
      ...data
    }
  }).then(res => res.result || {})
}

function checkMerchantAccess() {
  return callMerchantConsole('check')
}

function loginMerchant(password, setupCode = '') {
  return callMerchantConsole('login', { password, setupCode })
}

function changeMerchantPassword(oldPassword, newPassword) {
  return callMerchantConsole('changePassword', { oldPassword, newPassword })
}

function getMerchantDashboard() {
  return callMerchantConsole('dashboard')
}

module.exports = {
  callMerchantConsole,
  checkMerchantAccess,
  loginMerchant,
  changeMerchantPassword,
  getMerchantDashboard
}
