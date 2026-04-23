const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 常量定义
const PAYMENT_EXPIRE_MINUTES = 15
const PAYMENT_EXPIRE_MS = PAYMENT_EXPIRE_MINUTES * 60 * 1000
const AMOUNT_TOLERANCE = 0.0001

/**
 * 规范化文本值
 * @param {*} value - 原始值
 * @returns {string} 去除首尾空格的字符串
 */
function normalizeText(value) {
  return String(value || '').trim()
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

function getRechargeSignatureSecret() {
  return normalizeText(process.env.RECHARGE_ORDER_SECRET)
}

function signRechargeSnapshot(openid, snapshot) {
  const secret = getRechargeSignatureSecret()
  if (!secret) {
    return ''
  }

  const payload = [
    normalizeText(openid),
    normalizeText(snapshot.rechargeId),
    roundMoney(snapshot.amount).toFixed(2),
    roundMoney(snapshot.giveAmount).toFixed(2),
    roundMoney(snapshot.totalGet).toFixed(2)
  ].join('|')

  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

function getPayConfig() {
  const subMchId = normalizeText(
    process.env.SUB_MCH_ID ||
    process.env.SUB_MCHID ||
    process.env.TCB_SUB_MCH_ID ||
    ''
  )

  if (!subMchId) {
    throw new Error('请先在云函数环境变量中配置 SUB_MCH_ID')
  }

  return {
    subMchId,
    envId: cloud.DYNAMIC_CURRENT_ENV
  }
}

async function closeExpiredOrder(orderId) {
  await db.collection('order').doc(orderId).update({
    data: {
      orderStatus: '已取消',
      status: 5,
      cancelReason: 'payment_timeout',
      cancelTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
}

async function resolveRechargePricing(order, collectionProvider = db) {
  const rechargeSnapshot = order && order.rechargeSnapshot ? order.rechargeSnapshot : null
  const rechargeSnapshotSignature = normalizeText(order && order.rechargeSnapshotSignature)
  if (
    rechargeSnapshot &&
    rechargeSnapshot.rechargeId === order.rechargeId &&
    rechargeSnapshotSignature &&
    rechargeSnapshotSignature === signRechargeSnapshot(order._openid, rechargeSnapshot)
  ) {
    return {
      amount: roundMoney(rechargeSnapshot.amount),
      giveAmount: roundMoney(rechargeSnapshot.giveAmount),
      totalGet: roundMoney(rechargeSnapshot.totalGet)
    }
  }

  const rechargeId = normalizeText(order.rechargeId)
  if (!rechargeId) {
    throw new Error('充值订单缺少套餐信息')
  }

  const rechargeRes = await collectionProvider.collection('rechargeOptions').doc(rechargeId).get()
  const recharge = rechargeRes.data
  if (!recharge) {
    throw new Error('充值套餐不存在')
  }

  const amount = roundMoney(recharge.amount)
  const giveAmount = roundMoney(recharge.giveAmount)
  if (amount <= 0) {
    throw new Error('充值金额不合法')
  }

  return {
    amount,
    giveAmount,
    totalGet: roundMoney(amount + giveAmount)
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const outTradeNo = normalizeText(event.outTradeNo)
  const totalFee = roundMoney(event.totalFee)

  if (!outTradeNo) {
    return {
      success: false,
      error: '订单号不能为空'
    }
  }

  if (totalFee <= 0) {
    return {
      success: false,
      error: '支付金额不合法'
    }
  }

  let order

  try {
    const orderRes = await db.collection('order').doc(outTradeNo).get()
    order = orderRes.data
  } catch (err) {
    return {
      success: false,
      error: '订单不存在'
    }
  }

  if (!order) {
    return {
      success: false,
      error: '订单不存在'
    }
  }

  if (order._openid !== OPENID) {
    return {
      success: false,
      error: '无权支付该订单'
    }
  }

  const pendingPaymentState = getPendingPaymentState(order)

  if (pendingPaymentState.state === 'paid') {
    return {
      success: false,
      error: '订单已支付',
      pendingPaymentState: 'paid',
      pendingPaymentClosed: false,
      currentOrderStatus: pendingPaymentState.currentOrderStatus
    }
  }

  if (pendingPaymentState.state === 'cancelled') {
    return {
      success: false,
      error: '订单已取消',
      pendingPaymentState: 'cancelled',
      pendingPaymentClosed: true,
      currentOrderStatus: pendingPaymentState.currentOrderStatus
    }
  }

  if (pendingPaymentState.state === 'expired') {
    await closeExpiredOrder(outTradeNo)
    return {
      success: false,
      error: '订单支付已关闭，请重新下单',
      pendingPaymentState: 'closed',
      pendingPaymentClosed: true,
      currentOrderStatus: '已关闭'
    }
  }

  if (pendingPaymentState.state !== 'pending') {
    return {
      success: false,
      error: '订单当前不是待支付状态，无法继续支付',
      pendingPaymentState: 'closed',
      pendingPaymentClosed: true,
      currentOrderStatus: pendingPaymentState.currentOrderStatus
    }
  }

  let expectedFee = roundMoney(order.finalPrice || order.payAmount || order.amount || 0)
  if (order.type === 'recharge') {
    try {
      const rechargePricing = await resolveRechargePricing(order)
      expectedFee = rechargePricing.amount
    } catch (err) {
      return {
        success: false,
        error: err.message || '充值订单信息异常'
      }
    }
  }

  if (Math.abs(expectedFee - totalFee) > AMOUNT_TOLERANCE) {
    return {
      success: false,
      error: '支付金额与订单不一致'
    }
  }

  if (isPaymentExpired(order)) {
    await closeExpiredOrder(outTradeNo)
    return {
      success: false,
      error: '订单支付已关闭，请重新下单',
      pendingPaymentState: 'closed',
      pendingPaymentClosed: true,
      currentOrderStatus: '已关闭'
    }
  }

  let payConfig

  try {
    payConfig = getPayConfig()
  } catch (err) {
    return {
      success: false,
      error: err.message || '微信支付未配置'
    }
  }

  try {
    const res = await cloud.cloudPay.unifiedOrder({
      body: event.body,
      outTradeNo,
      spbillCreateIp: '127.0.0.1',
      subMchId: payConfig.subMchId,
      totalFee: Math.round(expectedFee * 100),
      envId: payConfig.envId,
      functionName: 'pay_success',
      nonceStr: event.nonceStr,
      tradeType: 'JSAPI'
    })

    return res
  } catch (err) {
    return {
      success: false,
      error: err.message || '微信支付下单失败'
    }
  }
}