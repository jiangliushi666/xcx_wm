const app = getApp()
const { getStorefrontShopInfo } = require('../../utils/storefrontApi')
const { getCurrentUserProfile } = require('../../utils/userProfile')

Page({
  data: {
    orderGoods: [],
    totalPrice: 0,
    totalPriceText: '0.00',
    deliveryFee: 0,
    deliveryFeeText: '0.00',
    finalPrice: 0,
    finalPriceText: '0.00',
    payMethod: 'wechat',
    userInfo: null,
    userBalance: 0,
    addresses: [],
    selectedAddressId: '',
    selectedAddress: null,
    remark: '',
    shopInfo: {},
    storeId: '',
    selectedStore: null,
    submitting: false,
    canSubmit: false,
    showAuthModal: false,
    savedPayMethod: null
  },

  onLoad() {
    this.loadCartData()
    this.loadShopInfo()
    this.loadUserInfo()
    this.loadAddressList()
  },

  onShow() {
    this.loadUserInfo()
    this.loadAddressList()
    this.recalculateAmount()
    this.updateCanSubmit()
  },

  loadCartData() {
    try {
      const cartData = wx.getStorageSync('settleCartData')
      if (!cartData || !cartData.cart) {
        wx.showToast({
          title: '购物车为空',
          icon: 'none'
        })
        setTimeout(() => {
          wx.navigateBack()
        }, 1500)
        return
      }

      const orderGoods = []
      for (const cartKey in cartData.cart) {
        const item = cartData.cart[cartKey]
        if (!item || !item.info) continue

        const tags = Array.isArray(item.tagLabels) ? item.tagLabels : []
        const price = Number(item.info.price || 0)
        const count = Number(item.count || 1)
        orderGoods.push({
          dishId: item.dishId || item.info._id,
          dishName: item.info.name,
          dishImage: item.info.image,
          price,
          count,
          subtotalText: (price * count).toFixed(2),
          tags,
          canUseMiandan: !!item.info.canUseMiandan
        })
      }

      this.setData({
        orderGoods,
        totalPrice: Number(cartData.totalPrice || 0),
        totalPriceText: Number(cartData.totalPrice || 0).toFixed(2),
        storeId: cartData.storeId || '',
        selectedStore: cartData.selectedStore || null
      })

      wx.removeStorageSync('settleCartData')
    } catch (err) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  async loadShopInfo() {
    try {
      const shopInfo = await getStorefrontShopInfo({
        storeId: this.data.storeId
      })
      this.setData({
        shopInfo
      })
      this.recalculateAmount()
    } catch (err) {
      console.warn('加载店铺信息失败:', err)
    }
  },

  async loadUserInfo() {
    try {
      const profile = await getCurrentUserProfile()
      const user = profile.user || null

      this.setData({
        userInfo: user,
        userBalance: Number((user && user.balance) || 0)
      })

      app.globalData.userInfo = user
      this.updatePayMethod()
      this.updateCanSubmit()
    } catch (err) {
      console.warn('加载用户信息失败:', err)
    }
  },

  async loadAddressList() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'addressList'
      })

      const result = res.result || {}
      const list = result.success ? (result.data || []) : []
      const selectedIdFromStorage = wx.getStorageSync('settleSelectedAddressId') || ''

      let selectedAddressId = selectedIdFromStorage
      if (!selectedAddressId && list.length > 0) {
        const defaultAddress = list.find(item => item.isDefault)
        selectedAddressId = defaultAddress ? defaultAddress._id : list[0]._id
      }

      const selectedAddress = list.find(item => item._id === selectedAddressId) || null

      this.setData({
        addresses: list,
        selectedAddressId,
        selectedAddress
      })

      if (selectedAddressId) {
        wx.removeStorageSync('settleSelectedAddressId')
      }

      this.recalculateAmount()
      this.updateCanSubmit()
    } catch (err) {
      console.warn('加载地址列表失败:', err)
    }
  },

  selectAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const selectedAddress = this.data.addresses.find(item => item._id === addressId) || null

    this.setData({
      selectedAddressId: addressId,
      selectedAddress
    })

    this.recalculateAmount()
    this.updateCanSubmit()
  },

  goToAddressList() {
    wx.navigateTo({
      url: '/pages/address/list/list?from=settle'
    })
  },

  goToAddAddress() {
    wx.navigateTo({
      url: '/pages/address/edit/edit?from=settle'
    })
  },

  onRemarkInput(e) {
    this.setData({
      remark: e.detail.value
    })
  },

  recalculateAmount() {
    const totalPrice = Number(this.data.totalPrice || 0)
    const shopInfo = this.data.shopInfo || {}
    const deliveryEnabled = shopInfo.deliveryEnabled !== false
    const baseDeliveryFee = Number(shopInfo.deliveryFee || 0)
    const freeDeliveryThreshold = Number(shopInfo.freeDeliveryThreshold || 0)

    let deliveryFee = deliveryEnabled ? baseDeliveryFee : 0
    if (deliveryEnabled && freeDeliveryThreshold > 0 && totalPrice >= freeDeliveryThreshold) {
      deliveryFee = 0
    }

    const finalPrice = Number((totalPrice + deliveryFee).toFixed(2))

    this.setData({
      deliveryFee,
      finalPrice,
      deliveryFeeText: Number(deliveryFee || 0).toFixed(2),
      finalPriceText: finalPrice.toFixed(2)
    })

    this.updatePayMethod()
    this.updateCanSubmit()
  },

  updatePayMethod() {
    const { userBalance, finalPrice } = this.data

    if (finalPrice <= 0) {
      this.setData({
        payMethod: 'balance'
      })
      return
    }

    if (userBalance >= finalPrice) {
      this.setData({
        payMethod: 'balance'
      })
    } else {
      this.setData({
        payMethod: 'wechat'
      })
    }
  },

  updateCanSubmit() {
    const { orderGoods, selectedAddress, shopInfo, storeId } = this.data
    const canSubmit = !!(orderGoods && orderGoods.length > 0 && selectedAddress && storeId && (shopInfo.deliveryEnabled !== false))

    this.setData({
      canSubmit
    })
  },

  selectPayMethod(e) {
    const payMethod = e.currentTarget.dataset.value
    const { userBalance, finalPrice } = this.data

    if (payMethod === 'balance' && finalPrice > 0 && userBalance < finalPrice) {
      wx.showToast({
        title: '余额不足',
        icon: 'none'
      })
      this.setData({
        payMethod: 'wechat'
      })
      return
    }

    this.setData({
      payMethod
    })
  },

  async submitOrder() {
    if (!this.data.canSubmit || this.data.submitting) {
      return
    }

    try {
      await this.loadUserInfo()
    } catch (err) {
      console.warn('刷新用户信息失败:', err)
    }

    const userInfo = this.data.userInfo
    if (!userInfo || !userInfo.avatarUrl || !userInfo.nickName || !userInfo.phoneNumber) {
      this.setData({
        showAuthModal: true,
        savedPayMethod: this.data.payMethod
      })
      return
    }

    const selectedAddress = this.data.selectedAddress
    if (!selectedAddress) {
      wx.showToast({
        title: '请选择收货地址',
        icon: 'none'
      })
      return
    }

    const finalPrice = Number(this.data.finalPrice || 0)
    const payMethod = this.data.payMethod
    const payWithBalance = payMethod === 'balance' && finalPrice > 0

    if (payWithBalance && Number(this.data.userBalance || 0) < finalPrice) {
      wx.showToast({
        title: '余额不足，请使用微信支付',
        icon: 'none'
      })
      this.setData({
        payMethod: 'wechat'
      })
      return
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '下单中...' })

    let orderId = ''
    let paymentCompleted = false

    try {
      const doBuyRes = await wx.cloud.callFunction({
        name: 'doBuy',
        data: {
          orderGoods: this.data.orderGoods,
          totalPrice: this.data.totalPrice,
          deliveryFee: this.data.deliveryFee,
          finalPrice,
          payWithBalance,
          storeId: this.data.storeId,
          addressId: selectedAddress._id,
          deliveryType: 'delivery',
          remark: this.data.remark
        }
      })

      if (!doBuyRes.result || !doBuyRes.result.success) {
        throw new Error(doBuyRes.result?.error || '下单失败')
      }

      orderId = doBuyRes.result.orderId

      if (payWithBalance || finalPrice <= 0) {
        wx.hideLoading()
        wx.showToast({
          title: '下单成功',
          icon: 'success'
        })
      } else {
        wx.hideLoading()
        wx.showLoading({ title: '拉起支付中...' })

        const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
        const payRes = await wx.cloud.callFunction({
          name: 'pay',
          data: {
            body: `外卖订单支付¥${finalPrice.toFixed(2)}`,
            outTradeNo: orderId,
            totalFee: finalPrice,
            nonceStr
          }
        })

        const payResult = payRes.result || {}
        if (payResult.success === false) {
          throw new Error(payResult.error || '微信支付配置失败')
        }

        const payment = payResult.payment ? payResult.payment : payResult
        if (!payment || !payment.timeStamp || !payment.nonceStr || !payment.package || !payment.paySign) {
          throw new Error('微信支付参数不完整')
        }

        wx.hideLoading()
        await wx.requestPayment(payment)
        paymentCompleted = true

        wx.showToast({
          title: '支付成功',
          icon: 'success'
        })
      }

      this.clearCart()
      this.setData({
        remark: ''
      })

      this.loadUserInfo()

      setTimeout(() => {
        wx.switchTab({
          url: '/pages/myorder/myorder'
        })
      }, 1500)
    } catch (err) {
      wx.hideLoading()

      const canceled = err && err.errMsg && err.errMsg.indexOf('cancel') !== -1
      const createdPendingOrder = !!(orderId && !paymentCompleted)

      wx.showToast({
        title: canceled
          ? '订单已保留，可继续支付'
          : (createdPendingOrder ? '订单已创建，可在订单页继续支付' : (err.message || '下单失败')),
        icon: 'none'
      })

      if (createdPendingOrder) {
        setTimeout(() => {
          wx.switchTab({
            url: '/pages/myorder/myorder'
          })
        }, 1500)
      }
    } finally {
      this.setData({ submitting: false })
    }
  },

  clearCart() {
    const pages = getCurrentPages()
    const indexPage = pages.find(page => page.route === 'pages/index/index')
    if (indexPage) {
      indexPage.updateCart({})
    }
  },

  editOrder() {
    wx.navigateBack()
  },

  async onUserInfoSaved() {
    const savedPayMethod = this.data.savedPayMethod || this.data.payMethod

    this.setData({
      showAuthModal: false
    })

    try {
      await this.loadUserInfo()
    } catch (err) {
      console.warn('重新加载用户信息失败:', err)
    }

    if (savedPayMethod) {
      this.setData({
        payMethod: savedPayMethod,
        savedPayMethod: null
      })
    }

    setTimeout(() => {
      this.submitOrder()
    }, 300)
  }
})
