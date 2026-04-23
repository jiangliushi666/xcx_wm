const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const PAYMENT_EXPIRE_MINUTES = 15

function normalizeText(value) {
  return String(value || '').trim()
}

function roundMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) {
    return 0
  }
  return Number(amount.toFixed(2))
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

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const rechargeId = normalizeText(event.rechargeId)

  if (!rechargeId) {
    return {
      success: false,
      error: '充值套餐ID不能为空'
    }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      const userRes = await transaction.collection('user').where({
        _openid: OPENID
      }).limit(1).get()
      const rechargeRes = await transaction.collection('rechargeOptions').doc(rechargeId).get()

      if (!userRes.data || userRes.data.length === 0) {
        throw new Error('用户不存在')
      }

      const recharge = rechargeRes.data
      if (!recharge || Number(recharge.status) === 0) {
        throw new Error('充值套餐不存在或已下架')
      }

      const amount = roundMoney(recharge.amount)
      const giveAmount = roundMoney(recharge.giveAmount)
      const totalGet = roundMoney(amount + giveAmount)

      if (amount <= 0) {
        throw new Error('充值金额不合法')
      }

      const user = userRes.data[0]
      const rechargeSnapshot = {
        rechargeId,
        amount,
        giveAmount,
        totalGet
      }
      const orderData = {
        type: 'recharge',
        rechargeId,
        amount,
        giveAmount,
        totalGet,
        rechargeSnapshot,
        rechargeSnapshotSignature: signRechargeSnapshot(OPENID, rechargeSnapshot),
        pay_status: false,
        status: 0,
        orderStatus: '待支付',
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        paymentExpireAt: new Date(Date.now() + PAYMENT_EXPIRE_MINUTES * 60 * 1000),
        _openid: OPENID,
        userNickName: user.nickName || '',
        userAvatar: user.avatarUrl || '',
        userPhone: user.phoneNumber || ''
      }

      const orderRes = await transaction.collection('order').add({
        data: orderData
      })

      return {
        success: true,
        data: {
          orderId: orderRes._id,
          amount,
          giveAmount,
          totalGet
        }
      }
    })

    return result
  } catch (err) {
    return {
      success: false,
      error: err.message || '创建充值订单失败'
    }
  }
}
