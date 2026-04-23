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

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const orderId = String(event.orderId || '').trim()

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
        error: '无权查看该订单'
      }
    }

    return {
      success: true,
      data: order
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '查询订单详情失败'
    }
  }
}
