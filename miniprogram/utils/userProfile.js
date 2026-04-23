/**
 * 用户信息API模块
 * 提供用户信息的获取和保存功能
 */

/**
 * 调用用户信息云函数
 * @param {string} action - 操作类型 ('get' | 'save')
 * @param {Object} data - 请求数据
 * @returns {Promise<Object>} 云函数返回结果
 */
function callUserProfile(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'userProfile',
    data: {
      action,
      ...data
    }
  }).then(res => res.result || {})
}

/**
 * 获取当前用户信息
 * @param {Object} options - 查询选项
 * @returns {Promise<Object>} 用户信息对象
 * @throws {Error} 获取失败时抛出错误
 * @example
 * const profile = await getCurrentUserProfile()
 * console.log(profile.user)
 */
async function getCurrentUserProfile(options = {}) {
  const result = await callUserProfile('get', options)
  if (!result.success) {
    throw new Error(result.error || '获取用户信息失败')
  }
  return result.data || {}
}

/**
 * 保存当前用户信息
 * @param {Object} profile - 用户信息对象
 * @param {string} [profile.nickName] - 用户昵称
 * @param {string} [profile.avatarUrl] - 头像URL
 * @param {string} [profile.phoneNumber] - 手机号码
 * @returns {Promise<Object>} 保存后的用户信息
 * @throws {Error} 保存失败时抛出错误
 */
async function saveCurrentUserProfile(profile = {}) {
  const result = await callUserProfile('save', profile)
  if (!result.success) {
    throw new Error(result.error || '保存用户信息失败')
  }
  return result.data || {}
}

module.exports = {
  callUserProfile,
  getCurrentUserProfile,
  saveCurrentUserProfile
}