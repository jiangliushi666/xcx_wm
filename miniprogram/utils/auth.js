/**
 * 权限验证工具
 * 用于检查用户是否有管理员权限
 */

/**
 * 检查用户是否为管理员
 * @returns {Promise<boolean>} 是否为管理员
 */
async function checkAdminPermission() {
  try {
    // 获取用户信息
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo) {
      return false
    }
    
    // 调用云函数验证管理员权限
    const res = await wx.cloud.callFunction({
      name: 'adminOps',
      data: {
        action: 'checkAdminAuth'
      }
    })
    
    return res.result && res.result.success === true
  } catch (err) {
    // 静默处理，不输出console.error
    return false
  }
}

/**
 * 管理员权限验证中间件
 * 在页面onLoad或onShow中调用
 * @param {Object} pageContext - 页面上下文(this)
 * @param {Function} callback - 验证通过后的回调函数
 */
async function requireAdmin(pageContext, callback) {
  const isAdmin = await checkAdminPermission()
  
  if (!isAdmin) {
    wx.showModal({
      title: '权限不足',
      content: '您没有管理员权限，无法访问此功能',
      showCancel: false,
      success: () => {
        // 返回上一页或首页
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      }
    })
    return false
  }
  
  // 验证通过，执行回调
  if (typeof callback === 'function') {
    callback()
  }
  
  return true
}

/**
 * 检查商家权限（已有的权限检查）
 * @returns {Promise<Object>} 权限检查结果
 */
async function checkMerchantAccess() {
  try {
    const res = await wx.cloud.callFunction({
      name: 'merchantConsole',
      data: {
        action: 'checkAccess'
      }
    })
    return res.result || { success: false, authorized: false }
  } catch (err) {
    // 静默处理，返回失败结果
    return { success: false, authorized: false }
  }
}

module.exports = {
  checkAdminPermission,
  requireAdmin,
  checkMerchantAccess
}