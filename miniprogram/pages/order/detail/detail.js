const {
  cancelPendingOrder,
  resumePendingOrderPayment
} = require('../../../utils/paymentHelper')
const {
  getOrderStatusText,
  getOrderStatusColor,
  formatOrderTime,
  formatAddress,
  isCancelable,
  isPayable,
  getPendingPaymentState
} = require('../../../utils/orderHelper')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

Page({
  data: {
    orderId: '',
    order: null,
    loading: false,
    actionType: ''
  },

  onLoad(options) {
    this.setData({
      orderId: options.id || ''
    })
    this.loadOrder()
  },

  async loadOrder() {
    const orderId = this.data.orderId
    if (!orderId) return

    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'orderDetail',
        data: {
          orderId
        }
      })
      const result = res.result || {}
      if (!result.success) {
        throw new Error(result.error || '加载失败')
      }
      const order = result.data || null

      if (!order) {
        throw new Error('订单不存在')
      }

      const orderTime = order.createTime ? formatOrderTime(order.createTime) : ''
      const addressText = formatAddress(order.addressSnapshot)
      const statusText = getOrderStatusText(order)
      const statusColor = getOrderStatusColor(order)

      this.setData({
        order: {
          ...order,
          goods: (order.goods || []).map(item => ({
            ...item,
            subtotalText: (Number(item.price || 0) * Number(item.count || 1)).toFixed(2)
          })),
          orderTime,
          addressText,
          receiverNameText: order.receiverName || (order.addressSnapshot && order.addressSnapshot.name) || '',
          receiverMobileText: order.receiverMobile || (order.addressSnapshot && order.addressSnapshot.mobile) || '',
          statusText,
          statusColor,
          canPay: isPayable(order),
          canCancel: isCancelable(order),
          payAmountText: Number(order.finalPrice || order.payAmount || 0).toFixed(2),
          totalPriceText: Number(order.totalPrice || 0).toFixed(2),
          deliveryFeeText: Number(order.deliveryFee || 0).toFixed(2)
        }
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1200)
    } finally {
      this.setData({ loading: false })
    }
  },

  async refreshOrderAfterPayment() {
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.loadOrder()
      const order = this.data.order
      if (!order || getPendingPaymentState(order).state !== 'pending') {
        return
      }
      await wait(600)
    }
  },

  async continuePay() {
    const order = this.data.order
    if (!order || !order.canPay || this.data.actionType) {
      return
    }

    this.setData({ actionType: 'pay' })

    try {
      wx.showLoading({ title: '拉起支付中...' })
      await resumePendingOrderPayment(order)
      wx.hideLoading()
      wx.showToast({
        title: '支付成功',
        icon: 'success'
      })
      await this.refreshOrderAfterPayment()
    } catch (err) {
      wx.hideLoading()
      const canceled = err && err.errMsg && err.errMsg.indexOf('cancel') !== -1
      wx.showToast({
        title: canceled ? '已取消支付' : (err.message || '支付失败'),
        icon: 'none'
      })
    } finally {
      this.setData({ actionType: '' })
    }
  },

  async cancelOrder() {
    const order = this.data.order
    if (!order || !order.canCancel || this.data.actionType) {
      return
    }

    const confirmRes = await new Promise(resolve => {
      wx.showModal({
        title: '取消订单',
        content: '确认取消这笔待支付订单吗？',
        success: resolve
      })
    })

    if (!confirmRes.confirm) {
      return
    }

    this.setData({ actionType: 'cancel' })

    try {
      wx.showLoading({ title: '取消中...' })
      const result = await cancelPendingOrder(order._id, 'user_cancelled')
      wx.hideLoading()
      if (!result || result.success === false) {
        throw new Error((result && result.error) || '取消订单失败')
      }

      wx.showToast({
        title: (result && result.message) || '订单已取消',
        icon: 'success'
      })
      await this.loadOrder()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '取消失败',
        icon: 'none'
      })
    } finally {
      this.setData({ actionType: '' })
    }
  }
})
