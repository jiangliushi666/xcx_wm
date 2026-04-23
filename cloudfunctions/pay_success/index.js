const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database({
  throwOnNotFound: false
})
const _ = db.command

function normalizeText(value) {
  return String(value || '').trim()
}

function getEventField(event = {}, keys = []) {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(event, key)) {
      continue
    }

    const value = event[key]
    if (value !== undefined && value !== null && value !== '') {
      return value
    }
  }

  return null
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

function getCallbackAmount(event = {}) {
  const candidates = [
    getEventField(event, ['cashFee', 'cash_fee']),
    getEventField(event, ['totalFee', 'total_fee'])
  ]

  for (const candidate of candidates) {
    if (candidate === null) {
      continue
    }

    const amount = Number(candidate)
    if (!Number.isFinite(amount) || amount <= 0) {
      continue
    }

    return roundMoney(amount / 100)
  }

  return null
}

function getPaymentAuditData(event = {}, expectedAmount = null) {
  const callbackAmount = getCallbackAmount(event)

  return {
    callbackReturnCode: normalizeText(getEventField(event, ['returnCode', 'return_code'])),
    callbackResultCode: normalizeText(getEventField(event, ['resultCode', 'result_code'])),
    callbackTransactionId: normalizeText(getEventField(event, ['transactionId', 'transaction_id'])),
    callbackBankType: normalizeText(getEventField(event, ['bankType', 'bank_type'])),
    callbackTotalFee: callbackAmount,
    callbackRawTimeEnd: normalizeText(getEventField(event, ['timeEnd', 'time_end'])),
    callbackReceivedAt: db.serverDate(),
    callbackAmountMatched: callbackAmount === null || expectedAmount === null
      ? null
      : Math.abs(callbackAmount - expectedAmount) <= 0.0001
  }
}

function buildPendingPaymentState(order = {}) {
  const orderStatus = normalizeText(order.orderStatus)
  const status = Number(order.status)

  if (order.pay_status) {
    return 'paid'
  }

  if (status === 5 || orderStatus === '已取消') {
    return 'cancelled'
  }

  if (orderStatus === '待支付' || (!orderStatus && status === 0)) {
    return 'pending'
  }

  return 'closed'
}

function resolveExpectedPayAmount(order = {}, rechargePricing = null) {
  if (order.type === 'recharge' && rechargePricing) {
    return roundMoney(rechargePricing.amount)
  }

  return roundMoney(order.finalPrice || order.payAmount || order.amount || 0)
}

function formatDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now())
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildAddressText(address) {
  if (!address) {
    return ''
  }

  if (address.fullAddress) {
    return address.fullAddress
  }

  const parts = [address.province, address.city, address.district, address.detail].filter(Boolean)
  return parts.join('')
}

function generatePrintContent(order, shopInfo) {
  const goods = Array.isArray(order.goods) ? order.goods : []
  const address = order.addressSnapshot || {}
  const totalPrice = Number(order.totalPrice || 0).toFixed(2)
  const deliveryFee = Number(order.deliveryFee || 0).toFixed(2)
  const payAmount = Number(order.finalPrice || order.payAmount || 0).toFixed(2)

  let content = ''
  content += `<C><font# bolder=1 height=2 width=2>外卖订单</font#></C><BR>`
  content += `<C><font# bolder=1 height=2 width=2>${escapeHtml(shopInfo?.name || '餐饮店')}</font#></C><BR>`
  content += `<BR>`
  content += `<LEFT>订单编号: ${escapeHtml(order._id || '')}</LEFT><BR>`
  content += `<LEFT>下单时间: ${escapeHtml(formatDate(order.createTime))}</LEFT><BR>`
  content += `<LEFT>收货人: ${escapeHtml(order.receiverName || address.name || '')}</LEFT><BR>`
  content += `<LEFT>联系电话: ${escapeHtml(order.receiverMobile || address.mobile || '')}</LEFT><BR>`
  if (buildAddressText(address)) {
    content += `<LEFT>配送地址: ${escapeHtml(buildAddressText(address))}</LEFT><BR>`
  }
  if (order.remark) {
    content += `<LEFT>备注: ${escapeHtml(order.remark)}</LEFT><BR>`
  }
  content += `<C>--------------商品--------------</C><BR>`

  goods.forEach(item => {
    const name = escapeHtml(item.dishName || item.goodsName || '未知商品')
    const count = Number(item.count || 1)
    const price = Number(item.price || 0).toFixed(2)
    content += `<LEFT>${name} x${count}  ￥${price}</LEFT><BR>`
    if (Array.isArray(item.tags) && item.tags.length > 0) {
      content += `<LEFT>  ${escapeHtml(item.tags.join(' '))}</LEFT><BR>`
    }
  })

  content += `<C>--------------------------------</C><BR>`
  content += `<RIGHT>商品合计  ￥${totalPrice}</RIGHT><BR>`
  content += `<RIGHT>配送费  ￥${deliveryFee}</RIGHT><BR>`
  content += `<RIGHT><font# bolder=1 height=2 width=1>实付  ￥${payAmount}</font#></RIGHT><BR>`
  content += `<LEFT>支付方式: 微信支付</LEFT><BR>`
  content += `<C>************** 完 **************</C><BR>`
  return content
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
      rechargeId: order.rechargeId,
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
    rechargeId,
    amount,
    giveAmount,
    totalGet: roundMoney(amount + giveAmount)
  }
}

async function printOrderAsync(orderId, orderData) {
  try {
    const internalSecret = String(process.env.INTERNAL_CALL_SECRET || '').trim()
    if (!internalSecret) {
      return
    }

    const printerRes = await db.collection('printer').limit(1).get()
    if (!printerRes.data || printerRes.data.length === 0) {
      return
    }

    const printer = printerRes.data[0]
    const shopRes = await db.collection('shopInfo').limit(1).get()
    const shopInfo = shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : null
    const printContent = generatePrintContent(orderData, shopInfo)

    const printRes = await cloud.callFunction({
      name: 'printManage',
      data: {
        $url: 'printNote',
        internalSecret,
        sn: printer.sn,
        voice: '19',
        voicePlayTimes: 1,
        voicePlayInterval: 3,
        content: printContent,
        copies: 1,
        expiresInSeconds: 7200,
        outTradeNo: orderId
      }
    })

    if (printRes.result && printRes.result.success) {
      } else {
      }
  } catch (err) {
    }
}

exports.main = async (event = {}) => {
  const orderId = normalizeText(getEventField(event, ['outTradeNo', 'out_trade_no']))
  const returnCode = normalizeText(getEventField(event, ['returnCode', 'return_code']))
  const resultCode = normalizeText(getEventField(event, ['resultCode', 'result_code']))

  if (!orderId) {
    return { errcode: 1, errmsg: '订单不存在' }
  }

  if (returnCode !== 'SUCCESS' || resultCode !== 'SUCCESS') {
    return { errcode: 1, errmsg: '支付未成功' }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      const orderRes = await transaction.collection('order').doc(orderId).get()
      const order = orderRes.data

      if (!order) {
        throw new Error('订单不存在')
      }

      const alreadyPaid = !!order.pay_status
      if (alreadyPaid) {
        return {
          success: true,
          order,
          alreadyPaid: true
        }
      }

      const currentPaymentState = buildPendingPaymentState(order)
      if (currentPaymentState !== 'pending') {
        throw new Error(currentPaymentState === 'cancelled' ? '订单已取消' : '订单当前不是待支付状态')
      }

      const rechargePricing = order.type === 'recharge'
        ? await resolveRechargePricing(order, transaction)
        : null
      const expectedAmount = resolveExpectedPayAmount(order, rechargePricing)
      const callbackAmount = getCallbackAmount(event)

      if (callbackAmount !== null && Math.abs(callbackAmount - expectedAmount) > 0.0001) {
        throw new Error('支付金额与订单不一致')
      }

      const nextOrderStatus = order.type === 'order' ? '待接单' : '已完成'
      const nextStatusCode = order.type === 'order' ? 1 : 4

      const paymentAuditData = getPaymentAuditData(event, expectedAmount)
      const orderUpdateData = {
        pay_status: true,
        orderStatus: nextOrderStatus,
        status: nextStatusCode,
        payTime: db.serverDate(),
        updateTime: db.serverDate(),
        payAmount: expectedAmount,
        ...paymentAuditData
      }

      if (rechargePricing) {
        Object.assign(orderUpdateData, {
          amount: rechargePricing.amount,
          giveAmount: rechargePricing.giveAmount,
          totalGet: rechargePricing.totalGet,
          rechargeSnapshot: rechargePricing,
          rechargeSnapshotSignature: signRechargeSnapshot(order._openid, rechargePricing)
        })
      }

      await transaction.collection('order').doc(orderId).update({
        data: orderUpdateData
      })

      if (order.type === 'recharge') {
        const openid = order._openid
        const userRes = await transaction.collection('user').where({
          _openid: openid
        }).get()

        if (!userRes.data || userRes.data.length === 0) {
          throw new Error('充值用户不存在')
        }

        const user = userRes.data[0]
        await transaction.collection('user').doc(user._id).update({
          data: {
            balance: _.inc(rechargePricing.totalGet)
          }
        })

        const paidRechargeCount = await transaction.collection('order').where({
          _openid: openid,
          type: 'recharge',
          pay_status: true
        }).count()

        let addFreeCount = 0
        if (paidRechargeCount.total === 1 && rechargePricing.amount >= 68) {
          addFreeCount = 1
        }

        if (addFreeCount > 0) {
          const freeBuyRes = await transaction.collection('freeBuy').where({
            _openid: openid
          }).get()

          if (freeBuyRes.data && freeBuyRes.data.length > 0) {
            await transaction.collection('freeBuy').doc(freeBuyRes.data[0]._id).update({
              data: {
                count: _.inc(addFreeCount)
              }
            })
          } else {
            await transaction.collection('freeBuy').add({
              data: {
                _openid: openid,
                count: addFreeCount
              }
            })
          }
        }
      }

      return {
        success: true,
        alreadyPaid: false,
        order: {
          ...order,
          ...(rechargePricing || {}),
          pay_status: true,
          payAmount: expectedAmount,
          orderStatus: nextOrderStatus,
          status: nextStatusCode,
          payTime: new Date(),
          ...paymentAuditData
        }
      }
    })

    if (result.success && !result.alreadyPaid && result.order && result.order.type === 'order') {
      printOrderAsync(orderId, result.order).catch(err => {
        })
    }

    if (result.success) {
      return { errcode: 0, errmsg: '支付成功' }
    }

    return { errcode: 1, errmsg: '事务执行失败' }
  } catch (e) {
    return {
      errcode: 1,
      errmsg: e.message || '服务器异常'
    }
  }
}
