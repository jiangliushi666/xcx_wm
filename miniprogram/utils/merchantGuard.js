const { checkMerchantAccess } = require('./merchantConsole')

function navigateToMerchantEntry() {
  const pages = getCurrentPages()
  if (pages.length > 1) {
    wx.navigateBack({
      delta: 1
    })
    return
  }

  wx.switchTab({
    url: '/pages/myhome/myhome'
  })
}

async function ensureMerchantAccess(pageInstance, options = {}) {
  if (pageInstance && pageInstance.__merchantAccessChecked) {
    return true
  }

  if (pageInstance && pageInstance.__merchantAccessBlocked) {
    return false
  }

  try {
    const res = await checkMerchantAccess()
    const data = res.data || {}

    if (res.success && data.authorized) {
      if (pageInstance) {
        pageInstance.__merchantAccessChecked = true
        pageInstance.__merchantAccessBlocked = false
      }
      return true
    }

    wx.showToast({
      title: options.message || data.statusMessage || '请先登录商家账号',
      icon: 'none',
      duration: options.duration || 1800
    })

    setTimeout(() => {
      try {
        navigateToMerchantEntry()
      } catch (err) {
        }
    }, options.delay || 350)

    if (pageInstance) {
      pageInstance.__merchantAccessBlocked = true
    }

    return false
  } catch (err) {
    wx.showToast({
      title: options.message || '请先登录商家账号',
      icon: 'none',
      duration: options.duration || 1800
    })

    setTimeout(() => {
      try {
        navigateToMerchantEntry()
      } catch (navErr) {
        }
    }, options.delay || 350)

    if (pageInstance) {
      pageInstance.__merchantAccessBlocked = true
    }

    return false
  }
}

function withMerchantGuard(pageConfig = {}, options = {}) {
  const originalOnLoad = pageConfig.onLoad
  const originalOnShow = pageConfig.onShow

  return {
    ...pageConfig,
    async onLoad(...args) {
      const ok = await ensureMerchantAccess(this, options)
      if (!ok) {
        return
      }

      if (typeof originalOnLoad === 'function') {
        return originalOnLoad.apply(this, args)
      }
    },
    async onShow(...args) {
      const ok = await ensureMerchantAccess(this, options)
      if (!ok) {
        return
      }

      if (typeof originalOnShow === 'function') {
        return originalOnShow.apply(this, args)
      }
    }
  }
}

module.exports = {
  ensureMerchantAccess,
  withMerchantGuard
}
