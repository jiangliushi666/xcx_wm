const ORDER_STATUS_TEXT = {
  0: '待支付',
  1: '待接单',
  2: '备餐中',
  3: '配送中',
  4: '已完成',
  5: '已取消'
}

const ORDER_STATUS_COLOR = {
  0: '#faad14',
  1: '#1890ff',
  2: '#722ed1',
  3: '#13c2c2',
  4: '#52c41a',
  5: '#8c8c8c'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const num = Number(value)
  return Number.isNaN(num) ? null : num
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

function getPendingPaymentState(order = {}) {
  const explicitState = normalizeText(order.pendingPaymentState)
  if (explicitState === 'pending') {
    return {
      state: 'pending',
      displayStatus: '待支付',
      pendingPaymentClosed: false
    }
  }

  if (explicitState === 'closed') {
    return {
      state: 'closed',
      displayStatus: '已关闭',
      pendingPaymentClosed: true
    }
  }

  if (explicitState === 'paid') {
    return {
      state: 'paid',
      displayStatus: normalizeText(order.orderStatus) || (order.type === 'recharge' ? '已完成' : '待接单'),
      pendingPaymentClosed: false
    }
  }

  if (explicitState === 'cancelled') {
    return {
      state: 'cancelled',
      displayStatus: '已取消',
      pendingPaymentClosed: true
    }
  }

  const orderStatus = normalizeText(order.orderStatus)
  const status = toNumber(order.status)

  if (order.pay_status) {
    return {
      state: 'paid',
      displayStatus: orderStatus || (order.type === 'recharge' ? '已完成' : '待接单'),
      pendingPaymentClosed: false
    }
  }

  if (status === 5 || orderStatus === '已取消') {
    return {
      state: 'cancelled',
      displayStatus: '已取消',
      pendingPaymentClosed: true
    }
  }

  const isPending = order.pendingPaymentOpen === true || orderStatus === '待支付' || (!orderStatus && status === 0)
  if (isPending) {
    const expireAt = getPaymentExpireTimestamp(order)
    if (order.pendingPaymentClosed === true || (expireAt !== null && expireAt <= Date.now())) {
      return {
        state: 'closed',
        displayStatus: '已关闭',
        pendingPaymentClosed: true
      }
    }

    return {
      state: 'pending',
      displayStatus: '待支付',
      pendingPaymentClosed: false
    }
  }

  return {
    state: 'closed',
    displayStatus: '已关闭',
    pendingPaymentClosed: true
  }
}

function getOrderStatusText(order = {}) {
  const pendingPaymentState = getPendingPaymentState(order)
  if (pendingPaymentState.state === 'pending' || pendingPaymentState.state === 'closed' || pendingPaymentState.state === 'cancelled') {
    return pendingPaymentState.displayStatus
  }

  if (order.type === 'recharge') {
    return order.pay_status === false ? '待支付' : '已完成'
  }

  const status = toNumber(order.status)
  if (status !== null && ORDER_STATUS_TEXT[status]) {
    return ORDER_STATUS_TEXT[status]
  }

  if (order.pay_status === false) {
    return '待支付'
  }

  return '待接单'
}

function getOrderStatusColor(order = {}) {
  const pendingPaymentState = getPendingPaymentState(order)
  if (pendingPaymentState.state === 'pending') {
    return ORDER_STATUS_COLOR[0]
  }

  if (pendingPaymentState.state === 'closed' || pendingPaymentState.state === 'cancelled') {
    return ORDER_STATUS_COLOR[5]
  }

  if (order.orderStatus) {
    const status = order.orderStatus
    if (status === '已完成') return ORDER_STATUS_COLOR[4]
    if (status === '已取消') return ORDER_STATUS_COLOR[5]
    if (status === '配送中') return ORDER_STATUS_COLOR[3]
    if (status === '备餐中') return ORDER_STATUS_COLOR[2]
    if (status === '待接单') return ORDER_STATUS_COLOR[1]
    if (status === '待支付') return ORDER_STATUS_COLOR[0]
  }

  if (order.type === 'recharge') {
    return order.pay_status === false ? ORDER_STATUS_COLOR[0] : ORDER_STATUS_COLOR[4]
  }

  const status = toNumber(order.status)
  if (status !== null && ORDER_STATUS_COLOR[status]) {
    return ORDER_STATUS_COLOR[status]
  }

  return '#1890ff'
}

function formatOrderTime(time) {
  if (!time) return ''

  const date = time instanceof Date ? time : new Date(time)
  const pad = (value) => (value < 10 ? `0${value}` : `${value}`)

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatAddress(address) {
  if (!address) {
    return ''
  }

  if (typeof address === 'string') {
    return address
  }

  const parts = [
    address.province,
    address.city,
    address.district,
    address.detail
  ].filter(Boolean)

  return parts.join('')
}

function isCancelable(order = {}) {
  return getPendingPaymentState(order).state === 'pending'
}

function isPayable(order = {}) {
  return getPendingPaymentState(order).state === 'pending'
}

module.exports = {
  ORDER_STATUS_TEXT,
  ORDER_STATUS_COLOR,
  getPendingPaymentState,
  getOrderStatusText,
  getOrderStatusColor,
  formatOrderTime,
  formatAddress,
  isCancelable,
  isPayable
}
