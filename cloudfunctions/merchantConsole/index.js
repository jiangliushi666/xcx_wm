const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const MERCHANT_LOGIN_ATTEMPT_COLLECTION = 'merchantLoginAttempt'
const MERCHANT_LOGIN_WINDOW_MS = 10 * 60 * 1000
const MERCHANT_LOGIN_MAX_ATTEMPTS = 5
const MERCHANT_LOGIN_LOCK_MS = 15 * 60 * 1000

function normalizeText(value) {
  return String(value || '').trim()
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2)
}

function pad(value) {
  return value < 10 ? `0${value}` : String(value)
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildAddressText(address) {
  if (!address) {
    return ''
  }

  if (address.fullAddress) {
    return address.fullAddress
  }

  return [
    address.province,
    address.city,
    address.district,
    address.detail
  ].filter(Boolean).join('')
}

function getOrderStatusText(order = {}) {
  if (order.orderStatus) {
    return order.orderStatus
  }

  if (order.pay_status === false) {
    return '待支付'
  }

  const statusMap = {
    0: '待支付',
    1: '待接单',
    2: '备餐中',
    3: '配送中',
    4: '已完成',
    5: '已取消'
  }

  const status = Number(order.status)
  return statusMap[status] || '待接单'
}

function getOrderStatusColor(order = {}) {
  const statusText = getOrderStatusText(order)

  if (statusText === '已完成') return '#52c41a'
  if (statusText === '已取消') return '#8c8c8c'
  if (statusText === '配送中') return '#13c2c2'
  if (statusText === '备餐中') return '#722ed1'
  if (statusText === '待接单') return '#1890ff'
  if (statusText === '待支付') return '#faad14'

  return '#1890ff'
}

function normalizeShopInfo(shopInfo = {}) {
  return {
    _id: shopInfo._id || '',
    name: shopInfo.name || '',
    description: shopInfo.description || '',
    phone: shopInfo.phone || '',
    addressText: shopInfo.addressText || '',
    deliveryEnabled: shopInfo.deliveryEnabled !== false,
    deliveryFee: Number(shopInfo.deliveryFee || 0),
    freeDeliveryThreshold: Number(shopInfo.freeDeliveryThreshold || 0),
    businessHours: shopInfo.businessHours || '',
    notice: shopInfo.notice || '',
    posterBgUrl: shopInfo.posterBgUrl || '',
    status: shopInfo.status || 'open'
  }
}

function getChinaDayStart() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const chinaNow = new Date(utc + 8 * 60 * 60 * 1000)
  chinaNow.setHours(0, 0, 0, 0)
  return new Date(chinaNow.getTime() - 8 * 60 * 60 * 1000)
}

function getSetupCode() {
  return normalizeText(process.env.MERCHANT_SETUP_CODE)
}

function hashPassword(password, salt) {
  return crypto.createHash('sha256').update(`${salt}:${password}`).digest('hex')
}

function buildPasswordFields(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return {
    passwordHash: hashPassword(password, salt),
    passwordSalt: salt,
    passwordVersion: 1,
    password: ''
  }
}

function verifyPassword(record, password) {
  if (record.passwordHash && record.passwordSalt) {
    return hashPassword(password, record.passwordSalt) === record.passwordHash
  }

  return normalizeText(record.password) === normalizeText(password)
}

async function cleanupExpiredPendingOrders() {
  await db.collection('order').where({
    pay_status: false,
    paymentExpireAt: _.lte(new Date()),
    status: _.neq(5)
  }).update({
    data: {
      orderStatus: '已取消',
      status: 5,
      cancelReason: 'payment_timeout',
      cancelTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })
}

async function getMerchantRecord() {
  const res = await db.collection('admin').limit(1).get()
  return (res.data && res.data[0]) || null
}

async function getShopInfo() {
  const res = await db.collection('shopInfo').limit(1).get()
  return normalizeShopInfo((res.data && res.data[0]) || {})
}

function buildRecentOrder(order) {
  return {
    _id: order._id,
    orderNo: order.orderNo || (order._id ? order._id.slice(-6).toUpperCase() : ''),
    orderStatus: getOrderStatusText(order),
    statusColor: getOrderStatusColor(order),
    createTimeText: formatDate(order.createTime),
    payAmountText: formatMoney(order.finalPrice || order.payAmount || 0),
    deliveryFeeText: formatMoney(order.deliveryFee || 0),
    receiverName: order.receiverName || (order.addressSnapshot && order.addressSnapshot.name) || '',
    addressText: buildAddressText(order.addressSnapshot),
    deliveryType: order.deliveryType || 'delivery'
  }
}

async function getMerchantLoginAttemptRecord(openid) {
  if (!openid) {
    return null
  }

  const res = await db.collection(MERCHANT_LOGIN_ATTEMPT_COLLECTION).where({
    openid
  }).limit(1).get()

  return (res.data && res.data[0]) || null
}

async function clearMerchantLoginAttempts(openid) {
  const record = await getMerchantLoginAttemptRecord(openid)
  if (!record) {
    return
  }

  await db.collection(MERCHANT_LOGIN_ATTEMPT_COLLECTION).doc(record._id).remove()
}

async function checkMerchantLoginThrottle(openid) {
  const record = await getMerchantLoginAttemptRecord(openid)
  if (!record) {
    return {
      locked: false,
      record: null
    }
  }

  const now = Date.now()
  const lockUntil = record.lockUntil ? new Date(record.lockUntil).getTime() : null
  if (lockUntil && Number.isFinite(lockUntil) && lockUntil > now) {
    const remainMinutes = Math.max(1, Math.ceil((lockUntil - now) / 60000))
    return {
      locked: true,
      message: `尝试过多，请${remainMinutes}分钟后再试`,
      record
    }
  }

  const lastAttemptAt = record.lastAttemptAt ? new Date(record.lastAttemptAt).getTime() : null
  if (!Number.isFinite(lastAttemptAt) || now - lastAttemptAt > MERCHANT_LOGIN_WINDOW_MS) {
    await db.collection(MERCHANT_LOGIN_ATTEMPT_COLLECTION).doc(record._id).remove()
    return {
      locked: false,
      record: null
    }
  }

  return {
    locked: false,
    record
  }
}

async function recordMerchantLoginFailure(openid) {
  if (!openid) {
    return
  }

  const throttle = await checkMerchantLoginThrottle(openid)
  const now = new Date()
  const currentCount = throttle.record ? Number(throttle.record.count || 0) : 0
  const nextCount = currentCount + 1
  const lockUntil = nextCount >= MERCHANT_LOGIN_MAX_ATTEMPTS
    ? new Date(Date.now() + MERCHANT_LOGIN_LOCK_MS)
    : null

  if (throttle.record) {
    await db.collection(MERCHANT_LOGIN_ATTEMPT_COLLECTION).doc(throttle.record._id).update({
      data: {
        count: nextCount,
        lastAttemptAt: now,
        lockUntil,
        updateTime: db.serverDate()
      }
    })
  } else {
    await db.collection(MERCHANT_LOGIN_ATTEMPT_COLLECTION).add({
      data: {
        openid,
        count: nextCount,
        lastAttemptAt: now,
        lockUntil,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })
  }
}

async function checkMerchantAccess(openid) {
  const [openidRecord, anyRecord, shopInfo] = await Promise.all([
    getMerchantRecordByOpenid(openid),
    getMerchantRecord(),
    getShopInfo()
  ])

  const setupCode = getSetupCode()
  const authorized = !!openidRecord
  const isFirstTime = !anyRecord
  const requiresSetupCode = isFirstTime

  let statusMessage = '请输入商家密码进入商家中心'
  if (isFirstTime) {
    statusMessage = setupCode
      ? '首次初始化请输入商家密码和初始化口令'
      : '商家中心暂未完成初始化'
  } else if (authorized) {
    statusMessage = '已登录，可查看经营数据'
  }

  return {
    success: true,
    data: {
      authorized,
      isFirstTime,
      requiresSetupCode,
      bootstrapConfigured: !!setupCode,
      merchantName: shopInfo.name || '商家中心',
      statusMessage,
      shopInfo
    }
  }
}

async function loginMerchant(openid, password, setupCode) {
  const rawPassword = normalizeText(password)

  if (!rawPassword) {
    return {
      success: false,
      error: '请输入商家密码'
    }
  }

  const throttle = await checkMerchantLoginThrottle(openid)
  if (throttle.locked) {
    return {
      success: false,
      error: throttle.message
    }
  }

  const record = await getMerchantRecord()

  if (!record) {
    const expectedSetupCode = getSetupCode()

    if (!expectedSetupCode) {
      return {
        success: false,
        error: '商家中心暂未完成初始化'
      }
    }

    if (rawPassword.length < 6) {
      return {
        success: false,
        error: '商家密码长度不能少于6位'
      }
    }

    if (normalizeText(setupCode) !== expectedSetupCode) {
      await recordMerchantLoginFailure(openid)
      return {
        success: false,
        error: '初始化口令错误'
      }
    }

    await db.collection('admin').add({
      data: {
        ...buildPasswordFields(rawPassword),
        openid,
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
        lastLoginTime: db.serverDate()
      }
    })

    await clearMerchantLoginAttempts(openid)

    return {
      success: true,
      data: {
        authorized: true,
        isFirstTime: true
      }
    }
  }

  if (!verifyPassword(record, rawPassword)) {
    await recordMerchantLoginFailure(openid)
    return {
      success: false,
      error: '密码错误'
    }
  }

  const updateData = {
    openid,
    lastLoginTime: db.serverDate(),
    updateTime: db.serverDate()
  }

  if (!record.passwordHash || !record.passwordSalt) {
    Object.assign(updateData, buildPasswordFields(rawPassword))
  }

  await db.collection('admin').doc(record._id).update({
    data: updateData
  })

  await clearMerchantLoginAttempts(openid)

  return {
    success: true,
    data: {
      authorized: true,
      isFirstTime: false
    }
  }
}

async function changeMerchantPassword(openid, oldPassword, newPassword) {
  const rawOldPassword = normalizeText(oldPassword)
  const rawNewPassword = normalizeText(newPassword)

  if (!rawOldPassword) {
    return {
      success: false,
      error: '请输入原密码'
    }
  }

  if (!rawNewPassword) {
    return {
      success: false,
      error: '请输入新密码'
    }
  }

  if (rawNewPassword.length < 6) {
    return {
      success: false,
      error: '新密码长度不能少于6位'
    }
  }

  const record = await getMerchantRecord()

  if (!record) {
    return {
      success: false,
      error: '商家账号不存在'
    }
  }

  if (record.openid && record.openid !== openid) {
    return {
      success: false,
      error: '当前账号无权限修改密码'
    }
  }

  if (!verifyPassword(record, rawOldPassword)) {
    return {
      success: false,
      error: '原密码错误'
    }
  }

  await db.collection('admin').doc(record._id).update({
    data: {
      ...buildPasswordFields(rawNewPassword),
      openid,
      updateTime: db.serverDate()
    }
  })

  return {
    success: true
  }
}

async function loadDashboard(openid) {
  const record = await getMerchantRecord()

  if (!record || record.openid !== openid) {
    return {
      success: false,
      error: '请先登录商家账号'
    }
  }

  await cleanupExpiredPendingOrders()

  const [shopInfo, orderRes] = await Promise.all([
    getShopInfo(),
    db.collection('order')
      .where({
        type: 'order',
        pay_status: true,
        createTime: _.gte(getChinaDayStart())
      })
      .orderBy('createTime', 'desc')
      .limit(200)
      .get()
  ])

  const orders = orderRes.data || []
  const summary = {
    todayOrderCount: orders.length,
    pendingOrderCount: 0,
    cookingOrderCount: 0,
    deliveringOrderCount: 0,
    completedOrderCount: 0,
    deliveryOrderCount: 0,
    todayRevenue: 0
  }

  orders.forEach(order => {
    const statusText = getOrderStatusText(order)
    const amount = Number(order.finalPrice || order.payAmount || 0)

    summary.todayRevenue += amount

    if (statusText === '待接单') {
      summary.pendingOrderCount += 1
    }
    if (statusText === '备餐中') {
      summary.cookingOrderCount += 1
    }
    if (statusText === '配送中') {
      summary.deliveringOrderCount += 1
    }
    if (statusText === '已完成') {
      summary.completedOrderCount += 1
    }
    if (String(order.deliveryType || 'delivery') === 'delivery') {
      summary.deliveryOrderCount += 1
    }
  })

  const summaryCards = [
    {
      label: '今日订单',
      value: String(summary.todayOrderCount),
      hint: '今天已支付的外卖单'
    },
    {
      label: '待接单',
      value: String(summary.pendingOrderCount),
      hint: '需要商家尽快处理'
    },
    {
      label: '备餐中',
      value: String(summary.cookingOrderCount),
      hint: '厨房正在制作'
    },
    {
      label: '今日营收',
      value: `¥${formatMoney(summary.todayRevenue)}`,
      hint: '按实付金额统计'
    }
  ]

  return {
    success: true,
    data: {
      authorized: true,
      merchantName: shopInfo.name || '商家中心',
      shopInfo,
      summary: {
        ...summary,
        todayRevenueText: formatMoney(summary.todayRevenue)
      },
      summaryCards,
      recentOrders: orders.slice(0, 5).map(buildRecentOrder),
      lastSyncText: formatDate(new Date())
    }
  }
}

exports.main = async (event = {}) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = normalizeText(event.action) || 'check'

  try {
    if (action === 'check') {
      return await checkMerchantAccess(openid)
    }

    if (action === 'login') {
      return await loginMerchant(openid, event.password, event.setupCode)
    }

    if (action === 'changePassword') {
      return await changeMerchantPassword(openid, event.oldPassword, event.newPassword)
    }

    if (action === 'dashboard') {
      return await loadDashboard(openid)
    }

    return {
      success: false,
      error: '未知操作'
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
