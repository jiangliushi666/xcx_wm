// pages/myhome/myhome.js
const app = getApp()
const { getCurrentUserProfile } = require('../../utils/userProfile')
const {
  checkMerchantAccess,
  loginMerchant,
  getMerchantDashboard
} = require('../../utils/merchantConsole')

Page({
  data: {
    userInfo: null, // 用户信息
    miandanCount: 0, // 免单次数
    showAuthModal: false, // 显示授权弹窗
    showPasswordModal: false, // 显示密码输入框
    adminPassword: '', // 商家密码
    merchantSetupCode: '', // 商家初始化口令
    isFirstTime: false, // 是否首次登录
    merchantBootstrapConfigured: false,
    merchantDashboard: {
      authorized: false,
      isFirstTime: false,
      requiresSetupCode: false,
      bootstrapConfigured: false,
      merchantName: '商家中心',
      statusMessage: '查看今日订单和经营数据',
      summaryCards: [],
      recentOrders: [],
      shopInfo: {},
      summary: {},
      lastSyncText: ''
    },
    version: '' // 版本号
  },

  onLoad() {
    this.merchantDashboardLoaded = false
    this.loadUserInfo()
    this.loadMerchantDashboard().finally(() => {
      this.merchantDashboardLoaded = true
    })
    this.getVersion()
  },

  onShow() {
    this.loadUserInfo()
    if (this.merchantDashboardLoaded) {
      this.loadMerchantDashboard()
    }
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      const profile = await getCurrentUserProfile({
        includeMiandan: true
      })
      const user = profile.user || null
      const miandanCount = Number(profile.miandanCount || 0)

      this.setData({
        userInfo: user,
        miandanCount
      })

      // 同时更新全局数据，确保其他页面也能获取最新信息
      app.globalData.userInfo = user
    } catch (err) {
      }
  },

  // 加载商家中心预览
  async loadMerchantDashboard() {
    try {
      const checkRes = await checkMerchantAccess()

      if (!checkRes.success) {
        return
      }

      const checkData = checkRes.data || {}

      if (!checkData.authorized) {
        this.setData({
          merchantDashboard: {
            authorized: false,
            isFirstTime: !!checkData.isFirstTime,
            requiresSetupCode: !!checkData.requiresSetupCode,
            bootstrapConfigured: !!checkData.bootstrapConfigured,
            merchantName: checkData.merchantName || '商家中心',
            statusMessage: checkData.statusMessage || (checkData.isFirstTime ? '首次开通请先完成商家密码设置' : '登录后即可查看经营数据'),
            summaryCards: [],
            recentOrders: [],
            shopInfo: checkData.shopInfo || {},
            summary: {},
            lastSyncText: ''
          }
        })
        return
      }

      const dashboardRes = await getMerchantDashboard()

      if (!dashboardRes.success) {
        throw new Error(dashboardRes.error || '获取商家看板失败')
      }

      const dashboard = dashboardRes.data || {}
      this.setData({
        merchantDashboard: {
          authorized: true,
          isFirstTime: false,
          merchantName: dashboard.merchantName || '商家中心',
          statusMessage: '已登录，可查看经营数据',
          summaryCards: dashboard.summaryCards || [],
          recentOrders: dashboard.recentOrders || [],
          shopInfo: dashboard.shopInfo || {},
          summary: dashboard.summary || {},
          lastSyncText: dashboard.lastSyncText || ''
        }
      })
    } catch (err) {
      }
  },

  // 显示授权弹窗
  showAuthModal() {
    this.setData({
      showAuthModal: true
    })
  },

  // 用户信息保存成功回调
  onUserInfoSaved() {
    // 刷新用户信息
    this.loadUserInfo()
  },

  // 跳转到充值页面
  goToRecharge() {
    if (!this.data.userInfo || !this.data.userInfo.phoneNumber) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      })
      return
    }

    wx.switchTab({
      url: '/pages/recharge/recharge'
    })
  },

  // 跳转到地址管理
  goToAddressList() {
    wx.navigateTo({
      url: '/pages/address/list/list'
    })
  },

  // 跳转到订单列表
  goToOrderList() {
    wx.switchTab({
      url: '/pages/myorder/myorder'
    })
  },

  // 跳转到订单页面
  goToOrder(e) {
    const status = e.currentTarget.dataset.status
    wx.switchTab({
      url: '/pages/myorder/myorder'
    })
  },

  // 跳转到商家中心
  async goToMerchantCenter() {
    try {
      const authRes = await checkMerchantAccess()
      const authData = authRes.data || {}

      if (authRes.success && authData.authorized) {
        wx.navigateTo({
          url: '/pages/admin/admin'
        })
        return
      }

      this.setData({
        showPasswordModal: true,
        isFirstTime: !!authData.isFirstTime,
        merchantBootstrapConfigured: !!authData.bootstrapConfigured,
        adminPassword: '',
        merchantSetupCode: ''
      })
    } catch (err) {
      wx.showToast({
        title: '打开失败，请重试',
        icon: 'none'
      })
    }
  },

  // 关闭密码弹窗
  closePasswordModal() {
    this.setData({
      showPasswordModal: false,
      adminPassword: '',
      merchantSetupCode: ''
    })
  },

  // 空函数，用于拦截遮罩点击，防止穿透到下层
  noop() {},

  // 阻止冒泡
  stopPropagation() {},

  // 密码输入
  onPasswordInput(e) {
    this.setData({
      adminPassword: e.detail.value
    })
  },

  onSetupCodeInput(e) {
    this.setData({
      merchantSetupCode: e.detail.value
    })
  },

  // 验证密码或设置密码
  async verifyPassword() {
    const password = this.data.adminPassword.trim()
    const setupCode = this.data.merchantSetupCode.trim()

    if (!password) {
      wx.showToast({
        title: '请输入密码',
        icon: 'none'
      })
      return
    }

    if (this.data.isFirstTime && password.length < 6) {
      wx.showToast({
        title: '密码长度不能少于6位',
        icon: 'none'
      })
      return
    }

    if (this.data.isFirstTime) {
      if (!this.data.merchantBootstrapConfigured) {
        wx.showToast({
          title: '商家入口暂未初始化',
          icon: 'none'
        })
        return
      }

      if (!setupCode) {
        wx.showToast({
          title: '请输入初始化口令',
          icon: 'none'
        })
        return
      }
    }

    try {
      wx.showLoading({ title: this.data.isFirstTime ? '设置中...' : '验证中...' })

      const res = await loginMerchant(password, setupCode)

      wx.hideLoading()

      if (!res.success) {
        wx.showToast({
          title: res.error || '登录失败',
          icon: 'none'
        })
        return
      }

      wx.showToast({
        title: this.data.isFirstTime ? '密码设置成功' : '登录成功',
        icon: 'success'
      })

      this.closePasswordModal()
      await this.loadMerchantDashboard()

      wx.navigateTo({
        url: '/pages/admin/admin'
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '操作失败，请重试',
        icon: 'none'
      })
    }
  },

  // 获取版本号
  getVersion() {
    const accountInfo = wx.getAccountInfoSync()
    const version = accountInfo.miniProgram.version || '1.0.0'
    this.setData({
      version: version
    })
  }
})
