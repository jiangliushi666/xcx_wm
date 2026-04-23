const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const ALLOWED_STATUS = new Set(['待支付', '待接单', '备餐中', '配送中', '已完成', '已取消'])
const ALLOWED_TRANSITIONS = {
  待支付: new Set(['已取消']),
  待接单: new Set(['备餐中', '已取消']),
  备餐中: new Set(['配送中', '已取消']),
  配送中: new Set(['已完成', '已取消']),
  已完成: new Set([]),
  已取消: new Set([])
}

function normalizeStatus(status) {
  if (!status) {
    return ''
  }

  const text = String(status).trim()
  return ALLOWED_STATUS.has(text) ? text : ''
}

function statusToCode(statusText) {
  switch (statusText) {
    case '待支付':
      return 0
    case '待接单':
      return 1
    case '备餐中':
      return 2
    case '配送中':
      return 3
    case '已完成':
      return 4
    case '已取消':
      return 5
    default:
      return 1
  }
}

function codeToStatusText(statusCode) {
  switch (Number(statusCode)) {
    case 0:
      return '待支付'
    case 1:
      return '待接单'
    case 2:
      return '备餐中'
    case 3:
      return '配送中'
    case 4:
      return '已完成'
    case 5:
      return '已取消'
    default:
      return '待接单'
  }
}

function getCurrentStatus(order = {}) {
  if (order.orderStatus) {
    return order.orderStatus
  }

  if (order.pay_status === false) {
    return '待支付'
  }

  return codeToStatusText(order.status)
}

async function ensureMerchantAuthorized(openid) {
  if (!openid) {
    return false
  }

  const res = await db.collection('admin').where({
    openid
  }).limit(1).get()
  return !!(res.data && res.data[0])
}

exports.main = async (event) => {
  const { orderId = '', orderStatus = '', operatorRemark = '', cancelReason = '' } = event || {}
  const normalizedStatus = normalizeStatus(orderStatus)
  const wxContext = cloud.getWXContext()

  if (!orderId) {
    return {
      success: false,
      error: '订单ID不能为空'
    }
  }

  if (!normalizedStatus) {
    return {
      success: false,
      error: '订单状态不合法'
    }
  }

  try {
    const authorized = await ensureMerchantAuthorized(wxContext.OPENID)

    if (!authorized) {
      return {
        success: false,
        error: '请先登录商家账号'
      }
    }

    const orderRes = await db.collection('order').doc(orderId).get()
    const order = orderRes.data

    if (!order) {
      return {
        success: false,
        error: '订单不存在'
      }
    }

    const currentStatus = getCurrentStatus(order)
    const allowedSet = ALLOWED_TRANSITIONS[currentStatus] || new Set()

    if (!allowedSet.has(normalizedStatus)) {
      return {
        success: false,
        error: `当前订单状态不支持变更为${normalizedStatus}`
      }
    }

    const updateData = {
      orderStatus: normalizedStatus,
      status: statusToCode(normalizedStatus),
      operatorRemark: String(operatorRemark || '').trim(),
      updateTime: db.serverDate()
    }

    if (normalizedStatus === '已取消') {
      const trimmedCancelReason = String(cancelReason || '').trim()
      updateData.cancelReason = trimmedCancelReason || updateData.operatorRemark || 'merchant_cancelled'
      updateData.cancelTime = db.serverDate()
    }

    await db.collection('order').doc(orderId).update({
      data: updateData
    })

    return {
      success: true
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '更新订单状态失败'
    }
  }
}
