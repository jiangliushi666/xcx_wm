const { getPendingPaymentState } = require('./orderHelper')

function buildPendingPaymentStateError(state, action) {
  if (state.state === 'paid') {
    return action === 'cancel' ? '订单已支付，无需取消' : '订单已支付'
  }

  if (state.state === 'cancelled') {
    return '订单已取消'
  }

  if (state.state === 'closed') {
    return '订单支付已关闭，请重新下单'
  }

  return action === 'cancel'
    ? '订单当前不是待支付状态，无法取消'
    : '订单当前不是待支付状态，无法继续支付'
}

async function cancelPendingOrder(orderId, reason = 'user_cancelled') {
  const order = orderId && typeof orderId === 'object' ? orderId : null
  const targetOrderId = String(order ? (order._id || '') : (orderId || '')).trim()

  if (!targetOrderId) {
    return null
  }

  if (order) {
    const pendingPaymentState = getPendingPaymentState(order)
    if (pendingPaymentState.state === 'paid' || pendingPaymentState.state === 'cancelled') {
      return {
        success: true,
        skipped: true,
        message: buildPendingPaymentStateError(pendingPaymentState, 'cancel')
      }
    }

    if (pendingPaymentState.state !== 'pending') {
      throw new Error(buildPendingPaymentStateError(pendingPaymentState, 'cancel'))
    }
  }

  const res = await wx.cloud.callFunction({
    name: 'cancelPendingOrder',
    data: {
      orderId: targetOrderId,
      reason
    }
  })

  return res.result || {}
}

function buildPendingOrderPaymentPayload(order = {}) {
  const pendingPaymentState = getPendingPaymentState(order)
  const isRecharge = order.type === 'recharge'
  const orderId = order._id || ''
  const totalFee = Number(
    isRecharge
      ? (order.amount || order.payAmount || 0)
      : (order.finalPrice || order.payAmount || 0)
  )

  if (!orderId) {
    throw new Error('订单ID不能为空')
  }

  if (pendingPaymentState.state !== 'pending') {
    throw new Error(buildPendingPaymentStateError(pendingPaymentState, 'pay'))
  }

  if (!Number.isFinite(totalFee) || totalFee <= 0) {
    throw new Error('订单金额不合法')
  }

  return {
    body: isRecharge
      ? `账户充值¥${totalFee.toFixed(2)}`
      : `外卖订单支付¥${totalFee.toFixed(2)}`,
    outTradeNo: orderId,
    totalFee
  }
}

async function resumePendingOrderPayment(order = {}) {
  const payload = buildPendingOrderPaymentPayload(order)
  const nonceStr = Math.random().toString(36).substr(2, 15) + Date.now().toString(36)
  const res = await wx.cloud.callFunction({
    name: 'pay',
    data: {
      ...payload,
      nonceStr
    }
  })

  const result = res.result || {}
  if (result.success === false) {
    throw new Error(result.error || '拉起支付失败')
  }

  const payment = result.payment ? result.payment : result
  if (!payment || !payment.timeStamp || !payment.nonceStr || !payment.package || !payment.paySign) {
    throw new Error('微信支付参数不完整')
  }

  await wx.requestPayment(payment)
  return {
    success: true
  }
}

module.exports = {
  cancelPendingOrder,
  resumePendingOrderPayment
}
