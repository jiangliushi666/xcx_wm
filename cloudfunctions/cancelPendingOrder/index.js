const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

async function ensureMerchantAuthorized(openid) {
  if (!openid) {
    return false
  }

  const res = await db.collection('admin').where({
    openid
  }).limit(1).get()
  return !!(res.data && res.data[0])
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toStatusCode(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function getTimestamp(value) {
  if (!value) {
    return null
  }

  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === 'string') {
    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : null
  }

  if (typeof value.toDate === 'function') {
    return getTimestamp(value.toDate())
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000
  }

  if (typeof value._seconds === 'number') {
    return value._seconds * 1000
  }

  if (value.$date) {
    return getTimestamp(value.$date)
  }

  return null
}

function getPaymentExpireTimestamp(order = {}) {
  const paymentExpireAt = getTimestamp(order.paymentExpireAt)
  if (paymentExpireAt !== null) {
    return paymentExpireAt
  }

  const createTime = getTimestamp(order.createTime)
  if (createTime === null) {
    return null
  }

  return createTime + 15 * 60 * 1000
}

function isPaymentExpired(order = {}) {
  const expireAt = getPaymentExpireTimestamp(order)
  return expireAt !== null && expireAt <= Date.now()
}

function getPendingPaymentState(order = {}) {
  const orderStatus = normalizeText(order.orderStatus)
  const statusCode = toStatusCode(order.status)

  if (order.pay_status) {
    return {
      state: 'paid',
      currentOrderStatus: orderStatus || '已支付',
      pendingPaymentClosed: false
    }
  }

  if (statusCode === 5 || orderStatus === '已取消') {
    return {
      state: 'cancelled',
      currentOrderStatus: '已取消',
      pendingPaymentClosed: true
    }
  }

  const isPending = orderStatus === '待支付' || (!orderStatus && statusCode === 0)
  if (isPending) {
    if (isPaymentExpired(order)) {
      return {
        state: 'expired',
        currentOrderStatus: '已关闭',
        pendingPaymentClosed: true
      }
    }

    return {
      state: 'pending',
      currentOrderStatus: '待支付',
      pendingPaymentClosed: false
    }
  }

  return {
    state: 'closed_unpaid',
    currentOrderStatus: orderStatus || '已关闭',
    pendingPaymentClosed: true
  }
}

async function closePendingOrder(orderId, reason) {
  await db.collection('order').doc(orderId).update({
    data: {
      orderStatus: '已取消',
      status: 5,
      cancelReason: reason,
      cancelTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const orderId = String(event.orderId || '').trim()
  const reason = String(event.reason || 'user_cancelled').trim() || 'user_cancelled'

  if (!orderId) {
    return {
      success: false,
      error: '订单ID不能为空'
    }
  }

  try {
    const orderRes = await db.collection('order').doc(orderId).get()
    const order = orderRes.data

    if (!order) {
      return {
        success: false,
        error: '订单不存在'
      }
    }

    const isOwner = order._openid === OPENID
    const isMerchant = await ensureMerchantAuthorized(OPENID)

    if (!isOwner && !isMerchant) {
      return {
        success: false,
        error: '无权操作该订单'
      }
    }

    const pendingPaymentState = getPendingPaymentState(order)

    if (pendingPaymentState.state === 'paid') {
      return {
        success: true,
        skipped: true,
        message: '订单已支付，无需取消',
        pendingPaymentState: 'paid',
        pendingPaymentClosed: false,
        currentOrderStatus: pendingPaymentState.currentOrderStatus
      }
    }

    if (pendingPaymentState.state === 'cancelled') {
      return {
        success: true,
        skipped: true,
        message: '订单已取消',
        pendingPaymentState: 'cancelled',
        pendingPaymentClosed: true,
        currentOrderStatus: pendingPaymentState.currentOrderStatus
      }
    }

    if (pendingPaymentState.state === 'expired') {
      await closePendingOrder(orderId, 'payment_timeout')
      return {
        success: true,
        skipped: true,
        message: '订单支付已关闭',
        pendingPaymentState: 'closed',
        pendingPaymentClosed: true,
        currentOrderStatus: '已关闭'
      }
    }

    if (pendingPaymentState.state !== 'pending') {
      return {
        success: false,
        error: '订单当前不是待支付状态，无法取消',
        pendingPaymentState: 'closed',
        pendingPaymentClosed: true,
        currentOrderStatus: pendingPaymentState.currentOrderStatus
      }
    }

    await closePendingOrder(orderId, reason)

    return {
      success: true,
      pendingPaymentState: 'cancelled',
      pendingPaymentClosed: true,
      currentOrderStatus: '已取消'
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '取消订单失败'
    }
  }
}
