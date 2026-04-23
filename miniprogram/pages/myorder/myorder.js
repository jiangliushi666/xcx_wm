const { listMyOrders } = require('../../utils/orderApi')
const {
  cancelPendingOrder,
  resumePendingOrderPayment
} = require('../../utils/paymentHelper')
const {
  getOrderStatusText,
  getOrderStatusColor,
  formatOrderTime,
  formatAddress,
  isCancelable,
  isPayable,
  getPendingPaymentState
} = require('../../utils/orderHelper')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

Page({
  data: {
    tabs: ['全部', '点餐订单', '充值订单'],
    currentTab: 0,
    orderList: [],
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false,
    actionOrderId: '',
    actionType: ''
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadOrders()
  },

  switchTab(e) {
    const index = e.currentTarget.dataset.index
    this.setData({
      currentTab: index,
      orderPage: 0,
      orderHasMore: true,
      orderList: []
    })
    this.loadOrders()
  },

  async loadOrders(append = false) {
    if (this.data.loadingOrders) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingOrders: true })

    try {
      const pageSize = this.data.orderPageSize
      const page = append ? this.data.orderPage + 1 : 0
      const typeMap = ['all', 'order', 'recharge']
      const type = typeMap[this.data.currentTab] || 'all'

      const {
        list: rawList = [],
        hasMore = false,
        page: currentPage = page
      } = await listMyOrders({
        type,
        paymentState: 'all',
        page,
        pageSize
      })

      const list = rawList.map(order => {
        const statusText = getOrderStatusText(order)
        const statusColor = getOrderStatusColor(order)
        const addressText = formatAddress(order.addressSnapshot)

        return {
          ...order,
          orderTimeText: order.createTime ? formatOrderTime(order.createTime) : '',
          statusText,
          statusColor,
          addressText,
          canPay: isPayable(order),
          canCancel: isCancelable(order),
          payAmountText: Number(order.finalPrice || order.payAmount || order.amount || 0).toFixed(2),
          totalPriceText: Number(order.totalPrice || 0).toFixed(2),
          deliveryFeeText: Number(order.deliveryFee || 0).toFixed(2)
        }
      })

      const newList = append ? this.data.orderList.concat(list) : list

      this.setData({
        orderList: newList,
        orderPage: currentPage,
        orderHasMore: hasMore
      })
    } catch (err) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
      this.setData({ loadingOrders: false })
    }
  },

  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },

  async refreshOrdersAfterPayment(orderId) {
    for (let attempt = 0; attempt < 5; attempt++) {
      await this.loadOrders()
      const latestOrder = this.data.orderList.find(item => item._id === orderId)
      if (!latestOrder || getPendingPaymentState(latestOrder).state !== 'pending') {
        return
      }
      await wait(600)
    }
  },

  async continuePay(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.orderList.find(item => item._id === orderId)

    if (!order || !order.canPay || this.data.actionOrderId) {
      return
    }

    this.setData({
      actionOrderId: orderId,
      actionType: 'pay'
    })

    try {
      wx.showLoading({ title: '拉起支付中...' })
      await resumePendingOrderPayment(order)
      wx.hideLoading()
      wx.showToast({
        title: '支付成功',
        icon: 'success'
      })
      await this.refreshOrdersAfterPayment(orderId)
    } catch (err) {
      wx.hideLoading()
      const canceled = err && err.errMsg && err.errMsg.indexOf('cancel') !== -1
      wx.showToast({
        title: canceled ? '已取消支付' : (err.message || '支付失败'),
        icon: 'none'
      })
    } finally {
      this.setData({
        actionOrderId: '',
        actionType: ''
      })
    }
  },

  async cancelOrder(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.orderList.find(item => item._id === orderId)

    if (!order || !order.canCancel || this.data.actionOrderId) {
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

    this.setData({
      actionOrderId: orderId,
      actionType: 'cancel'
    })

    try {
      wx.showLoading({ title: '取消中...' })
      const result = await cancelPendingOrder(orderId, 'user_cancelled')
      wx.hideLoading()
      if (!result || result.success === false) {
        throw new Error((result && result.error) || '取消订单失败')
      }

      wx.showToast({
        title: (result && result.message) || '订单已取消',
        icon: 'success'
      })
      await this.loadOrders()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '取消失败',
        icon: 'none'
      })
    } finally {
      this.setData({
        actionOrderId: '',
        actionType: ''
      })
    }
  },

  viewOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id
    const order = this.data.orderList.find(item => item._id === orderId)

    if (!order) return

    if (order.type === 'recharge') {
      wx.showModal({
        title: '充值订单详情',
        content: `充值金额：¥${order.amount}\n赠送金额：¥${order.giveAmount}\n到账金额：¥${order.totalGet}\n状态：${order.statusText}`,
        showCancel: false
      })
      return
    }

    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${order._id}`
    })
  }
})
