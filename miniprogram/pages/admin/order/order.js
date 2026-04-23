const {
  getOrderStatusText,
  formatOrderTime,
  formatAddress,
  getPendingPaymentState
} = require('../../../utils/orderHelper')
const { withMerchantGuard } = require('../../../utils/merchantGuard')
const { callAdminApi } = require('../../../utils/adminApi')

const ORDER_ACTIONS = {
  待支付: {
    nextStatus: '',
    nextStatusText: '',
    canCancel: true
  },
  待接单: {
    nextStatus: '备餐中',
    nextStatusText: '开始备餐',
    canCancel: true
  },
  备餐中: {
    nextStatus: '配送中',
    nextStatusText: '开始配送',
    canCancel: true
  },
  配送中: {
    nextStatus: '已完成',
    nextStatusText: '完成订单',
    canCancel: true
  },
  已完成: {
    nextStatus: '',
    nextStatusText: '',
    canCancel: false
  },
  已取消: {
    nextStatus: '',
    nextStatusText: '',
    canCancel: false
  },
  已关闭: {
    nextStatus: '',
    nextStatusText: '',
    canCancel: false
  }
}

const CANCEL_REASON_TEXT = {
  payment_timeout: '支付超时自动取消',
  user_cancelled: '用户取消'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatCancelReason(value) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }

  return CANCEL_REASON_TEXT[text] || text
}

function getStatusTone(statusText) {
  switch (statusText) {
    case '待支付':
      return 'warning'
    case '待接单':
    case '备餐中':
    case '配送中':
      return 'brand'
    case '已完成':
      return 'success'
    case '已取消':
    case '已关闭':
      return 'neutral'
    default:
      return 'brand'
  }
}

function getPrintStatusDisplay(printStatus) {
  switch (Number(printStatus)) {
    case 2:
      return {
        text: '已打印小票',
        tone: 'success'
      }
    case 3:
      return {
        text: '打印失败',
        tone: 'danger'
      }
    case 4:
      return {
        text: '打印已取消',
        tone: 'neutral'
      }
    default:
      return {
        text: '未打印小票',
        tone: 'warning'
      }
  }
}

function getActionDialogMeta(status) {
  if (status === '已取消') {
    return {
      title: '取消订单',
      subtitle: '请填写取消原因，方便后续追踪。',
      requiresCancelReason: true
    }
  }

  return {
    title: `更新为${status}`,
    subtitle: '可选填写操作备注，便于商家内部交接。',
    requiresCancelReason: false
  }
}

Page(withMerchantGuard({
  data: {
    orders: [],
    orderType: 0,
    typeOptions: [
      { text: '全部订单', value: 0 },
      { text: '充值订单', value: 1 },
      { text: '外卖订单', value: 2 }
    ],
    orderPage: 0,
    orderPageSize: 20,
    orderHasMore: true,
    loadingOrders: false,
    actionDialogVisible: false,
    actionDialogOrderId: '',
    actionDialogStatus: '',
    actionDialogTitle: '',
    actionDialogSubtitle: '',
    actionDialogRequiresCancelReason: false,
    actionDialogCancelReason: '',
    actionDialogOperatorRemark: '',
    actionDialogSubmitting: false
  },

  onLoad() {
    this.loadOrders()
  },

  onShow() {
    this.loadOrders()
  },

  onHide() {},

  onUnload() {},

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
      const res = await callAdminApi('listOrders', {
        orderType: this.data.orderType,
        page,
        pageSize,
        includeUnpaid: true
      })

      if (!res.success) {
        throw new Error(res.error || '加载订单失败')
      }

      const list = (res.data?.list || []).map(order => {
        const statusText = getOrderStatusText(order)
        const actions = this.getOrderActions(order, statusText)
        const pendingPaymentState = getPendingPaymentState(order)
        const printStatus = getPrintStatusDisplay(order.printStatus)

        return {
          ...order,
          createTimeText: order.createTime ? formatOrderTime(order.createTime) : '',
          statusText,
          statusTone: getStatusTone(statusText),
          addressText: formatAddress(order.addressSnapshot),
          nextStatus: actions.nextStatus,
          nextStatusText: actions.nextStatusText,
          canCancel: actions.canCancel,
          pendingPaymentState: pendingPaymentState.state,
          cancelReasonText: formatCancelReason(order.cancelReason),
          operatorRemarkText: normalizeText(order.operatorRemark),
          payAmountText: Number(order.finalPrice || order.payAmount || order.amount || 0).toFixed(2),
          deliveryFeeText: Number(order.deliveryFee || 0).toFixed(2),
          typeText: order.type === 'recharge' ? '充值订单' : '外卖订单',
          typeTone: order.type === 'recharge' ? 'brand' : 'neutral',
          printStatusText: printStatus.text,
          printStatusTone: printStatus.tone
        }
      })

      const newOrders = append ? this.data.orders.concat(list) : list

      this.setData({
        orders: newOrders,
        orderPage: page,
        orderHasMore: !!res.data?.hasMore
      })
    } catch (err) {
      if (!append) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingOrders: false })
    }
  },

  onChange(e) {
    const index = e.detail.index
    this.setData({
      orderType: index,
      orderPage: 0,
      orderHasMore: true,
      orders: []
    }, () => {
      this.loadOrders()
    })
  },

  refreshOrders() {
    this.loadOrders()
    wx.showToast({
      title: '已刷新',
      icon: 'none'
    })
  },

  onReachBottom() {
    if (this.data.orderHasMore && !this.data.loadingOrders) {
      this.loadOrders(true)
    }
  },

  stopPropagation() {},

  resetActionDialog() {
    this.setData({
      actionDialogVisible: false,
      actionDialogOrderId: '',
      actionDialogStatus: '',
      actionDialogTitle: '',
      actionDialogSubtitle: '',
      actionDialogRequiresCancelReason: false,
      actionDialogCancelReason: '',
      actionDialogOperatorRemark: '',
      actionDialogSubmitting: false
    })
  },

  getOrderActions(order, statusText = getOrderStatusText(order)) {
    if (order.type !== 'order') {
      return {
        nextStatus: '',
        nextStatusText: '',
        canCancel: false
      }
    }

    return ORDER_ACTIONS[statusText] || {
      nextStatus: '',
      nextStatusText: '',
      canCancel: false
    }
  },

  openActionDialog(e) {
    const orderId = e.currentTarget.dataset.id
    const status = e.currentTarget.dataset.status

    if (!orderId || !status) {
      return
    }

    const dialogMeta = getActionDialogMeta(status)

    this.setData({
      actionDialogVisible: true,
      actionDialogOrderId: orderId,
      actionDialogStatus: status,
      actionDialogTitle: dialogMeta.title,
      actionDialogSubtitle: dialogMeta.subtitle,
      actionDialogRequiresCancelReason: dialogMeta.requiresCancelReason,
      actionDialogCancelReason: '',
      actionDialogOperatorRemark: '',
      actionDialogSubmitting: false
    })
  },

  closeActionDialog() {
    if (this.data.actionDialogSubmitting) {
      return
    }

    this.resetActionDialog()
  },

  onCancelReasonInput(e) {
    this.setData({
      actionDialogCancelReason: e.detail.value
    })
  },

  onOperatorRemarkInput(e) {
    this.setData({
      actionDialogOperatorRemark: e.detail.value
    })
  },

  async submitActionDialog() {
    if (this.data.actionDialogSubmitting) {
      return
    }

    const orderId = this.data.actionDialogOrderId
    const status = this.data.actionDialogStatus
    const cancelReason = normalizeText(this.data.actionDialogCancelReason)
    const operatorRemark = normalizeText(this.data.actionDialogOperatorRemark)

    if (!orderId || !status) {
      return
    }

    if (this.data.actionDialogRequiresCancelReason && !cancelReason) {
      wx.showToast({
        title: '请输入取消原因',
        icon: 'none'
      })
      return
    }

    this.setData({ actionDialogSubmitting: true })

    try {
      wx.showLoading({ title: '更新中...' })
      const result = await wx.cloud.callFunction({
        name: 'orderAdminUpdateStatus',
        data: {
          orderId,
          orderStatus: status,
          cancelReason,
          operatorRemark
        }
      })

      if (!result.result || !result.result.success) {
        throw new Error(result.result?.error || '更新失败')
      }

      wx.hideLoading()
      this.resetActionDialog()
      wx.showToast({
        title: '更新成功',
        icon: 'success'
      })
      this.loadOrders()
    } catch (err) {
      wx.hideLoading()
      this.setData({ actionDialogSubmitting: false })
      wx.showToast({
        title: err.message || '更新失败',
        icon: 'none'
      })
    }
  }
}))
