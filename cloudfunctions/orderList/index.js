const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 常量定义
const PAYMENT_EXPIRE_MINUTES = 15
const PAYMENT_EXPIRE_MS = PAYMENT_EXPIRE_MINUTES * 60 * 1000
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50

/**
 * 规范化文本值
 * @param {*} value - 原始值
 * @returns {string} 去除首尾空格的字符串
 */
function normalizeText(value) {
  return String(value || '').trim()
}

/**
 * 安全转换为整数
 * @param {*} value - 原始值
 * @param {number} fallback - 默认值
 * @returns {number} 转换后的整数
 */
function toSafeInt(value, fallback = 0) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * 金额四舍五入到两位小数
 * @param {*} value - 原始金额
 * @returns {number} 处理后的金额
 */
function roundMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) {
    return 0
  }
  return Number(amount.toFixed(2))
}

/**
 * 转换为状态码
 * @param {*} value - 原始值
 * @returns {number|null} 转换后的状态码
 */
function toStatusCode(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * 获取时间戳
 * @param {*} value - 时间值
 * @returns {number|null} 时间戳（毫秒）
 */
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

  return createTime + PAYMENT_EXPIRE_MS
}

function getPendingPaymentState(order = {}) {
  const orderStatus = normalizeText(order.orderStatus)
  const statusCode = toStatusCode(order.status)

  if (order.pay_status) {
    return {
      state: 'paid',
      pendingPaymentClosed: false
    }
  }

  if (statusCode === 5 || orderStatus === '已取消') {
    return {
      state: 'cancelled',
      pendingPaymentClosed: true
    }
  }

  const isPending = orderStatus === '待支付' || (!orderStatus && statusCode === 0)
  if (isPending) {
    const expireAt = getPaymentExpireTimestamp(order)
    if (expireAt !== null && expireAt <= Date.now()) {
      return {
        state: 'expired',
        pendingPaymentClosed: true
      }
    }

    return {
      state: 'pending',
      pendingPaymentClosed: false
    }
  }

  return {
    state: 'closed_unpaid',
    pendingPaymentClosed: true
  }
}

function getOrderStatusText(order = {}) {
  if (order.orderStatus) {
    return order.orderStatus
  }

  const pendingPaymentState = getPendingPaymentState(order)
  if (pendingPaymentState.state === 'paid') {
    const statusMap = {
      1: '待接单',
      2: '备餐中',
      3: '配送中',
      4: '已完成',
      5: '已取消'
    }
    return statusMap[Number(order.status)] || '待接单'
  }

  if (pendingPaymentState.state === 'pending') {
    return '待支付'
  }

  return '已关闭'
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const pageSize = Math.max(1, Math.min(MAX_PAGE_SIZE, toSafeInt(event.pageSize, DEFAULT_PAGE_SIZE)))
  const page = Math.max(0, toSafeInt(event.page, 0))
  const skip = page * pageSize

  try {
    const countRes = await db.collection('order').where({
      _openid: OPENID
    }).count()
    const total = countRes.total

    const orderRes = await db.collection('order').where({
      _openid: OPENID
    }).orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()

    const orders = (orderRes.data || []).map(order => {
      const pendingPaymentState = getPendingPaymentState(order)
      return {
        ...order,
        orderStatus: getOrderStatusText(order),
        pendingPaymentState: pendingPaymentState.state,
        pendingPaymentClosed: pendingPaymentState.pendingPaymentClosed,
        totalPrice: roundMoney(order.totalPrice),
        deliveryFee: roundMoney(order.deliveryFee),
        finalPrice: roundMoney(order.finalPrice || order.payAmount)
      }
    })

    return {
      success: true,
      data: {
        list: orders,
        page,
        pageSize,
        total,
        hasMore: skip + orders.length < total
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '加载订单列表失败'
    }
  }
}