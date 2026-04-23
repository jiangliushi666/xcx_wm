const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

// 常量定义
const PAYMENT_EXPIRE_MINUTES = 15
const PAYMENT_EXPIRE_MS = PAYMENT_EXPIRE_MINUTES * 60 * 1000
const MAX_GOODS_COUNT = 99
const MAX_REMARK_LENGTH = 200

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
 * HTML转义
 * @param {string} str - 原始字符串
 * @returns {string} 转义后的字符串
 */
function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * 格式化日期
 * @param {Date|string|number} dateValue - 日期值
 * @returns {string} 格式化后的日期字符串 (YYYY-MM-DD HH:mm)
 */
function formatDate(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now())
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * 构建地址文本
 * @param {Object} address - 地址对象
 * @returns {string} 地址文本
 */
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

function normalizeGoods(orderGoods = []) {
  return orderGoods.map(item => {
    const tags = Array.isArray(item.tags)
      ? item.tags.map(tag => String(tag || '').trim()).filter(Boolean)
      : []
    return {
      dishId: String(item.dishId || item.goodsId || '').trim(),
      count: Math.max(1, toSafeInt(item.count, 1)),
      tags
    }
  })
}

async function resolveShopInfo(transaction) {
  const shopRes = await transaction.collection('shopInfo').limit(1).get()
  return shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : {}
}

async function listStores(transaction) {
  try {
    const storeRes = await transaction.collection('store')
      .orderBy('sort', 'asc')
      .limit(100)
      .get()

    return (storeRes.data || []).filter(item => String(item.status || '').trim() !== 'disabled')
  } catch (err) {
    return []
  }
}

function buildStoreSnapshot(store = {}) {
  if (!store || !store._id) {
    return null
  }

  return {
    _id: store._id,
    name: store.name || '',
    phone: store.phone || '',
    addressText: store.addressText || '',
    deliveryEnabled: store.deliveryEnabled !== false,
    pickupEnabled: store.pickupEnabled !== false,
    deliveryFee: roundMoney(store.deliveryFee),
    freeDeliveryThreshold: roundMoney(store.freeDeliveryThreshold),
    businessHours: store.businessHours || '',
    notice: store.notice || ''
  }
}

async function resolveStoreContext(transaction, storeId) {
  const stores = await listStores(transaction)
  const normalizedStoreId = normalizeText(storeId)

  if (stores.length > 0) {
    if (!normalizedStoreId) {
      throw new Error('请选择门店')
    }

    const store = stores.find(item => item._id === normalizedStoreId)
    if (!store) {
      throw new Error('门店不存在或已停用')
    }

    return {
      shopInfo: store,
      storeId: store._id,
      storeName: store.name || '',
      storeSnapshot: buildStoreSnapshot(store)
    }
  }

  const shopInfo = await resolveShopInfo(transaction)
  return {
    shopInfo,
    storeId: '',
    storeName: shopInfo.name || '',
    storeSnapshot: null
  }
}

async function verifyGoods(transaction, orderGoods = []) {
  const normalizedGoods = normalizeGoods(orderGoods)
  const dishIds = [...new Set(normalizedGoods.map(item => item.dishId).filter(Boolean))]

  if (dishIds.length === 0) {
    throw new Error('订单商品不能为空')
  }

  const dishRes = await transaction.collection('dish').where({
    _id: _.in(dishIds)
  }).get()
  const dishMap = new Map((dishRes.data || []).map(item => [item._id, item]))

  let totalPrice = 0
  const goods = normalizedGoods.map(item => {
    if (!item.dishId) {
      throw new Error('商品信息不完整')
    }

    if (!item.count || item.count <= 0) {
      throw new Error('商品数量不合法')
    }

    const dish = dishMap.get(item.dishId)
    if (!dish || Number(dish.status) === 0) {
      throw new Error('商品不存在或已下架')
    }

    const price = roundMoney(dish.price)
    totalPrice = roundMoney(totalPrice + price * item.count)

    return {
      dishId: dish._id,
      dishName: dish.name || '',
      dishImage: dish.image || '',
      price,
      count: item.count,
      tags: item.tags,
      canUseMiandan: !!dish.canUseMiandan
    }
  })

  return {
    goods,
    totalPrice
  }
}

function calculateDeliveryFee(shopInfo = {}, totalPrice, deliveryType) {
  if (deliveryType !== 'delivery') {
    throw new Error('当前仅支持外卖配送')
  }

  if (shopInfo.deliveryEnabled === false) {
    throw new Error('当前门店未开启配送')
  }

  const baseDeliveryFee = roundMoney(shopInfo.deliveryFee)
  const freeDeliveryThreshold = roundMoney(shopInfo.freeDeliveryThreshold)

  if (freeDeliveryThreshold > 0 && totalPrice >= freeDeliveryThreshold) {
    return 0
  }

  return baseDeliveryFee
}

function ensureAmountStable(clientValue, serverValue) {
  return Math.abs(roundMoney(clientValue) - roundMoney(serverValue)) <= 0.01
}

function generatePrintContent(order, shopInfo) {
  const goods = Array.isArray(order.goods) ? order.goods : []
  const address = order.addressSnapshot || {}
  const totalPrice = Number(order.totalPrice || 0).toFixed(2)
  const deliveryFee = Number(order.deliveryFee || 0).toFixed(2)
  const payAmount = Number(order.finalPrice || order.payAmount || 0).toFixed(2)
  const orderTime = formatDate(order.createTime)

  let content = ''
  content += `<C><font# bolder=1 height=2 width=2>外卖订单</font#></C><BR>`
  content += `<C><font# bolder=1 height=2 width=2>${escapeHtml(shopInfo?.name || '餐饮店')}</font#></C><BR>`
  content += `<BR>`
  content += `<LEFT>订单编号: ${escapeHtml(order._id || '')}</LEFT><BR>`
  content += `<LEFT>下单时间: ${escapeHtml(orderTime)}</LEFT><BR>`
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
    const name = escapeHtml(item.dishName || '未知商品')
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
  content += `<LEFT>支付方式: ${order.payWithBalance ? '余额支付' : order.useMiandan ? '免单支付' : '微信支付'}</LEFT><BR>`
  content += `<C>************** 完 **************</C><BR>`
  return content
}

async function resolveAddress(transaction, openid, addressId) {
  if (!addressId) {
    return null
  }

  const addressRes = await transaction.collection('address').doc(addressId).get()
  const address = addressRes.data

  if (!address || address._openid !== openid) {
    throw new Error('收货地址不存在')
  }

  return {
    _id: address._id,
    name: address.name || '',
    mobile: address.mobile || '',
    province: address.province || '',
    city: address.city || '',
    district: address.district || '',
    detail: address.detail || '',
    fullAddress: buildAddressText(address),
    label: address.label || '',
    lat: address.lat || '',
    lng: address.lng || ''
  }
}

async function printOrder(orderId, orderData) {
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
    const shopInfo = orderData.storeSnapshot || (shopRes.data && shopRes.data.length > 0 ? shopRes.data[0] : null)
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
    throw err
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const orderGoods = Array.isArray(event.orderGoods) ? event.orderGoods : []
  const clientTotalPrice = roundMoney(event.totalPrice)
  const clientDeliveryFee = roundMoney(event.deliveryFee)
  const clientFinalPrice = roundMoney(event.finalPrice)
  const useMiandan = !!event.useMiandan
  const payWithBalance = !!event.payWithBalance
  const addressId = String(event.addressId || '').trim()
  const storeId = normalizeText(event.storeId)
  const remark = String(event.remark || '').trim()
  const deliveryType = String(event.deliveryType || 'delivery').trim() || 'delivery'

  if (orderGoods.length === 0) {
    return {
      success: false,
      error: '订单商品不能为空'
    }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      const userRes = await transaction.collection('user').where({
        _openid: openid
      }).get()

      if (!userRes.data || userRes.data.length === 0) {
        throw new Error('用户不存在')
      }

      const user = userRes.data[0]
      const currentBalance = Number(user.balance || 0)
      const verifiedGoods = await verifyGoods(transaction, orderGoods)
      const storeContext = await resolveStoreContext(transaction, storeId)
      const shopInfo = storeContext.shopInfo
      const totalPrice = verifiedGoods.totalPrice
      const deliveryFee = calculateDeliveryFee(shopInfo, totalPrice, deliveryType)
      const finalPrice = useMiandan ? 0 : roundMoney(totalPrice + deliveryFee)

      if (
        !ensureAmountStable(clientTotalPrice, totalPrice) ||
        !ensureAmountStable(clientDeliveryFee, deliveryFee) ||
        !ensureAmountStable(clientFinalPrice, finalPrice)
      ) {
        throw new Error('订单金额已变化，请返回重新确认')
      }

      const addressSnapshot = await resolveAddress(transaction, openid, addressId)
      if (deliveryType === 'delivery' && !addressSnapshot) {
        throw new Error('请选择收货地址')
      }

      if (useMiandan && verifiedGoods.goods.some(item => !item.canUseMiandan)) {
        throw new Error('当前订单包含不可免单商品')
      }

      if (useMiandan) {
        const miandanRes = await transaction.collection('freeBuy').where({
          _openid: openid
        }).get()

        if (!miandanRes.data || miandanRes.data.length === 0 || miandanRes.data[0].count <= 0) {
          throw new Error('免单次数不足')
        }

        await transaction.collection('freeBuy').doc(miandanRes.data[0]._id).update({
          data: {
            count: db.command.inc(-1)
          }
        })
      }

      if (payWithBalance && finalPrice > 0) {
        if (currentBalance < finalPrice) {
          throw new Error('余额不足')
        }

        await transaction.collection('user').doc(user._id).update({
          data: {
            balance: db.command.inc(-finalPrice)
          }
        })
      }

      const payStatus = payWithBalance || useMiandan || finalPrice <= 0
      const orderStatus = payStatus ? '待接单' : '待支付'
      const now = new Date()
      const paymentExpireAt = new Date(now.getTime() + PAYMENT_EXPIRE_MINUTES * 60 * 1000)
      const orderData = {
        type: 'order',
        goods: verifiedGoods.goods,
        totalPrice,
        deliveryFee,
        totalAmount: roundMoney(totalPrice + deliveryFee),
        finalPrice,
        payAmount: finalPrice,
        useMiandan,
        payWithBalance,
        deliveryType,
        orderStatus,
        status: payStatus ? 1 : 0,
        pay_status: payStatus,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        paymentExpireAt,
        storeId: storeContext.storeId,
        storeName: storeContext.storeName,
        storeSnapshot: storeContext.storeSnapshot,
        _openid: openid,
        userNickName: user.nickName || '',
        userAvatar: user.avatarUrl || '',
        userPhone: user.phoneNumber || '',
        addressId: addressSnapshot ? addressSnapshot._id : '',
        receiverName: addressSnapshot ? addressSnapshot.name : '',
        receiverMobile: addressSnapshot ? addressSnapshot.mobile : '',
        addressSnapshot,
        remark
      }

      const orderRes = await transaction.collection('order').add({
        data: orderData
      })

      return {
        success: true,
        orderId: orderRes._id,
        order: {
          ...orderData,
          _id: orderRes._id,
          createTime: now
        }
      }
    })

    if (result.success && result.orderId && (payWithBalance || useMiandan || result.order.finalPrice <= 0)) {
      try {
        await printOrder(result.orderId, result.order)
      } catch (printErr) {
        }
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: err.message || '下单失败'
    }
  }
}
