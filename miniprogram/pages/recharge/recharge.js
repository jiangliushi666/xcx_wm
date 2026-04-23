// pages/recharge/recharge.js
const app = getApp()
const { cancelPendingOrder } = require('../../utils/paymentHelper')
const { getStorefrontRechargeOptions } = require('../../utils/storefrontApi')
const { getCurrentUserProfile } = require('../../utils/userProfile')
Page({
  data: {
    rechargeList: [], // 充值套餐列表
    userInfo: null, // 用户信息
    showAuthModal: false, // 显示授权弹窗
    // 分页相关
    rechargePage: 0,
    rechargePageSize: 20,
    rechargeHasMore: true,
    loadingRecharge: false
  },

  onLoad() {
    this.loadRechargeList()
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      const profile = await getCurrentUserProfile()
      const user = profile.user || null

      this.setData({
        userInfo: user
      })

      app.globalData.userInfo = user
    } catch (err) {
      }
  },

  // 加载充值套餐列表
  async loadRechargeList(append = false) {
    if (this.data.loadingRecharge) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingRecharge: true })

    try {
      const pageSize = this.data.rechargePageSize
      const page = append ? this.data.rechargePage + 1 : 0
      const rechargeData = await getStorefrontRechargeOptions({
        page,
        pageSize
      })
      const list = rechargeData.list || []
      const newList = append ? this.data.rechargeList.concat(list) : list

      this.setData({
        rechargeList: newList,
        rechargePage: page,
        rechargeHasMore: !!rechargeData.hasMore
      })
    } catch (err) {
      if (!append) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingRecharge: false })
    }
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.rechargeHasMore && !this.data.loadingRecharge) {
      this.loadRechargeList(true)
    }
  },

  // 确认充值（直接点击卡片充值）
  confirmRecharge(e) {
    const recharge = e.currentTarget.dataset.recharge
    if (!recharge) {
      wx.showToast({ title: '请选择充值套餐', icon: 'none' })
      return
    }

    // 检查用户信息完整性
    const userInfo = this.data.userInfo
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      this.setData({
        showAuthModal: true,
        pendingRecharge: recharge // 保存待充值的套餐
      })
      return
    }

    const totalGet = recharge.amount + recharge.giveAmount
   // const hasMiandan = recharge.amount >= 68 // 满68元赠送免单
    
    let content = `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`
    // if (hasMiandan) {
    //   content += '\n额外赠送1次免单机会'
    // }

    wx.showModal({
      title: '确认充值',
      content: content,
      success: async (res) => {
        if (res.confirm) {
          await this.doRecharge(recharge)
        }
      }
    })
  },

  // 执行充值
  async doRecharge(recharge) {
    wx.showLoading({ title: '拉起支付中...' })
    let orderId = ''
    let paymentCompleted = false

    try {
      const createOrderRes = await wx.cloud.callFunction({
        name: 'createRechargeOrder',
        data: {
          rechargeId: recharge._id
        }
      })

      const createOrderResult = createOrderRes.result || {}
      if (!createOrderResult.success) {
        throw new Error(createOrderResult.error || '创建充值订单失败')
      }

      const rechargeOrder = createOrderResult.data || {}
      orderId = rechargeOrder.orderId || ''

      if (!orderId) {
        throw new Error('充值订单创建失败')
      }

      const payAmount = Number(rechargeOrder.amount || 0)
      if (!Number.isFinite(payAmount) || payAmount <= 0) {
        throw new Error('充值金额不合法')
      }

      // 生成随机字符串
      const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)

      // 调用云函数统一下单
      const payRes = await wx.cloud.callFunction({
        name: 'pay',
        data: {
          body: `账户充值¥${payAmount.toFixed(2)}`,
          outTradeNo: orderId,
          totalFee: payAmount,  // 元，云函数里会转成分
          nonceStr
        }
      })

      const payResult = payRes.result || {}
      if (payResult.success === false) {
        throw new Error(payResult.error || '微信支付配置失败')
      }

      const payment = payResult.payment ? payResult.payment : payResult

      wx.hideLoading()

      // 调起微信支付
      await wx.requestPayment(payment)
      paymentCompleted = true

      wx.showToast({ title: '支付成功，余额更新中...', icon: 'success' })

      // 支付成功后，pay_success 云函数会更新订单状态并增加余额
      // 这里稍等一会儿再刷新用户信息
      setTimeout(() => {
        this.loadUserInfo()
      }, 2000)

    } catch (err) {
      if (orderId && !paymentCompleted) {
        try {
          await cancelPendingOrder(orderId, 'user_cancelled')
        } catch (cancelErr) {
          }
      }
      wx.hideLoading()
      if (err && err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
        wx.showToast({ title: '已取消支付', icon: 'none' })
      } else {
        wx.showToast({ title: '支付失败，请重试', icon: 'none' })
      }
    }
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '充值优惠活动',
      path: '/pages/recharge/recharge',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '充值优惠活动',
      query: '',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 处理用户授权（组件已经保存了用户信息，这里只需要刷新并继续充值）
  async handleUserAuth(e) {
    try {
      // 组件已经保存了用户信息，这里只需要重新加载用户信息
      await this.loadUserInfo()
      
      this.setData({
        showAuthModal: false
      })
      
      // 授权成功后，如果有待充值套餐，直接执行充值（不再检查用户信息）
      if (this.data.pendingRecharge) {
        const recharge = this.data.pendingRecharge
        this.setData({ pendingRecharge: null })
        
        // 直接执行充值，不再检查用户信息
        setTimeout(() => {
          const totalGet = recharge.amount + recharge.giveAmount
          // const hasMiandan = recharge.amount >= 68
          
          let content = `充值¥${recharge.amount}，赠送¥${recharge.giveAmount}，共到账¥${totalGet}`
          // if (hasMiandan) {
          //   content += '\n额外赠送1次免单机会'
          // }

          wx.showModal({
            title: '确认充值',
            content: content,
            success: async (res) => {
              if (res.confirm) {
                await this.doRecharge(recharge)
              }
            }
          })
        }, 500)
      }
      
    } catch (err) {
      wx.showToast({
        title: '处理失败，请重试',
        icon: 'none'
      })
    }
  }
})

