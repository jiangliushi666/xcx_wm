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

Page({
  data: {
    merchantDashboard: {
      authorized: false,
      merchantName: '商家中心',
      statusMessage: '正在加载经营看板...',
      shopInfo: {},
      summary: {},
      summaryCards: [],
      recentOrders: [],
      lastSyncText: ''
    },
    showPasswordModal: false,
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  },

  async onLoad(options) {
    this.dashboardLoadedOnce = false
    wx.setNavigationBarTitle({
      title: '商家中心'
    })

    if (options.changePassword === 'true') {
      setTimeout(() => {
        this.showChangePassword()
      }, 500)
    }

    await this.loadDashboard()
    this.dashboardLoadedOnce = true
  },

  onShow() {
    if (this.dashboardLoadedOnce) {
      this.loadDashboard(false)
    }
  },

  // 加载经营看板
  async loadDashboard(showLoading = true) {
    try {
      if (showLoading) {
        wx.showLoading({ title: '加载中...' })
      }

      const authRes = await checkMerchantAccess()
      const authData = authRes.data || {}

      if (!authRes.success || !authData.authorized) {
        if (showLoading) {
          wx.hideLoading()
        }

        wx.showToast({
          title: authData.statusMessage || '请先在我的页完成商家登录',
          icon: 'none'
        })

        setTimeout(() => {
          navigateToMerchantEntry()
        }, 600)
        return
      }

      const dashboardRes = await getMerchantDashboard()

      if (!dashboardRes.success) {
        throw new Error(dashboardRes.error || '加载经营看板失败')
      }

      const dashboard = dashboardRes.data || {}
      this.setData({
        merchantDashboard: {
          authorized: true,
          merchantName: dashboard.merchantName || '商家中心',
          statusMessage: '单门店经营看板',
          shopInfo: dashboard.shopInfo || {},
          summary: dashboard.summary || {},
          summaryCards: dashboard.summaryCards || [],
          recentOrders: dashboard.recentOrders || [],
          lastSyncText: dashboard.lastSyncText || ''
        }
      })

      wx.setNavigationBarTitle({
        title: dashboard.merchantName || '商家中心'
      })
    } catch (err) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      if (showLoading) {
        wx.hideLoading()
      }
    }
  },

  // 菜品管理
  goToDish() {
    wx.navigateTo({
      url: '/pages/admin/dish/dish'
    })
  },

  // 用户管理
  goToUser() {
    wx.navigateTo({
      url: '/pages/admin/user/user'
    })
  },

  // 订单管理
  goToOrder() {
    wx.navigateTo({
      url: '/pages/admin/order/order'
    })
  },

  // 充值选项管理
  goToRechargeOptions() {
    wx.navigateTo({
      url: '/pages/admin/rechargeOptions/rechargeOptions'
    })
  },

  // 公告管理
  goToNotice() {
    wx.navigateTo({
      url: '/pages/admin/notice/notice'
    })
  },

  // 入口码管理
  goToTableCode() {
    wx.navigateTo({
      url: '/pages/admin/tableCode/tableCode'
    })
  },

  // 打印机管理
  goToPrinter() {
    wx.navigateTo({
      url: '/pages/admin/printer/printer'
    })
  },

  // 店铺设置
  goToShopInfo() {
    wx.navigateTo({
      url: '/pages/admin/shopInfo/shopInfo'
    })
  },

  // 刷新看板
  refreshDashboard() {
    this.loadDashboard()
  },

  // 显示修改密码弹窗
  showChangePassword() {
    this.setData({
      showPasswordModal: true,
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    })
  },

  // 关闭密码弹窗
  closePasswordModal() {
    this.setData({
      showPasswordModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入旧密码
  onOldPasswordInput(e) {
    this.setData({
      oldPassword: e.detail.value
    })
  },

  // 输入新密码
  onNewPasswordInput(e) {
    this.setData({
      newPassword: e.detail.value
    })
  },

  // 输入确认密码
  onConfirmPasswordInput(e) {
    this.setData({
      confirmPassword: e.detail.value
    })
  },

  // 确认修改密码
  async confirmChangePassword() {
    const { oldPassword, newPassword, confirmPassword } = this.data

    if (!oldPassword) {
      wx.showToast({
        title: '请输入原密码',
        icon: 'none'
      })
      return
    }

    if (!newPassword) {
      wx.showToast({
        title: '请输入新密码',
        icon: 'none'
      })
      return
    }

    if (newPassword.length < 6) {
      wx.showToast({
        title: '新密码长度不能少于6位',
        icon: 'none'
      })
      return
    }

    if (newPassword !== confirmPassword) {
      wx.showToast({
        title: '两次密码输入不一致',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '修改中...' })

      const result = await changeMerchantPassword(oldPassword, newPassword)

      wx.hideLoading()

      if (!result.success) {
        wx.showToast({
          title: result.error || '修改失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: '密码修改成功',
        icon: 'success'
      })

      this.closePasswordModal()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '修改失败，请重试',
        icon: 'none'
      })
    }
  },

  // 返回上一页
  goBack() {
    navigateToMerchantEntry()
  }
})
