const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const USER_ADJUST_LOG_COLLECTION = 'userAdjustLog'

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
 * 安全转换为数字
 * @param {*} value - 原始值
 * @param {number} fallback - 默认值
 * @returns {number} 转换后的数字
 */
function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value)
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
 * 检查值是否为空
 * @param {*} value - 待检查的值
 * @returns {boolean} 是否为空
 */
function isBlankValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && !value.trim())
}

/**
 * 安全解析数字字段
 * @param {*} value - 原始值
 * @param {string} fieldName - 字段名（用于错误提示）
 * @param {Object} options - 配置选项
 * @returns {number} 解析后的数字
 */
function parseNumberField(value, fieldName, options = {}) {
  const {
    required = false,
    defaultValue = 0,
    min = Number.NEGATIVE_INFINITY,
    max = Number.POSITIVE_INFINITY,
    minMessage = `${fieldName}不能小于${min}`,
    maxMessage = `${fieldName}不能大于${max}`
  } = options

  if (isBlankValue(value)) {
    if (required) {
      throw new Error(`${fieldName}不能为空`)
    }
    return defaultValue
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName}不合法`)
  }

  if (parsed < min) {
    throw new Error(minMessage)
  }

  if (parsed > max) {
    throw new Error(maxMessage)
  }

  return parsed
}

function buildShopInfo(shopInfo = {}) {
  return {
    _id: shopInfo._id || '',
    name: shopInfo.name || '',
    description: shopInfo.description || '',
    phone: shopInfo.phone || '',
    addressText: shopInfo.addressText || '',
    deliveryEnabled: shopInfo.deliveryEnabled !== false,
    pickupEnabled: shopInfo.pickupEnabled !== false,
    deliveryFee: toSafeNumber(shopInfo.deliveryFee, 0),
    freeDeliveryThreshold: toSafeNumber(shopInfo.freeDeliveryThreshold, 0),
    businessHours: shopInfo.businessHours || '',
    notice: shopInfo.notice || '',
    posterBgUrl: normalizeText(shopInfo.posterBgUrl),
    status: normalizeText(shopInfo.status) || 'open',
    sort: toSafeInt(shopInfo.sort, 0),
    isDefault: !!shopInfo.isDefault,
    legacy: !!shopInfo.legacy
  }
}

function buildDishPayload(dish = {}) {
  return {
    name: normalizeText(dish.name),
    price: toSafeNumber(dish.price, 0),
    originalPrice: toSafeNumber(dish.originalPrice, 0),
    description: normalizeText(dish.description),
    categoryId: normalizeText(dish.categoryId),
    categoryName: normalizeText(dish.categoryName),
    image: normalizeText(dish.image),
    status: Number(dish.status) === 0 ? 0 : 1,
    sort: toSafeInt(dish.sort, 0),
    tags: Array.isArray(dish.tags) ? dish.tags : [],
    canUseMiandan: !!dish.canUseMiandan,
    updateTime: db.serverDate()
  }
}

async function getCollectionFirstRecord(collectionName) {
  const res = await db.collection(collectionName).limit(1).get()
  return (res.data && res.data[0]) || null
}

async function getDishCategoryById(categoryId) {
  const res = await db.collection('dishCategory').where({
    _id: categoryId
  }).limit(1).get()

  return (res.data && res.data[0]) || null
}

async function getUserById(userId, collectionProvider = db) {
  if (!userId) {
    return null
  }

  try {
    const res = await collectionProvider.collection('user').doc(userId).get()
    return res.data || null
  } catch (err) {
    return null
  }
}

async function getUserByOpenid(openid, collectionProvider = db) {
  if (!openid) {
    return null
  }

  const res = await collectionProvider.collection('user').where({
    _openid: openid
  }).limit(1).get()

  return (res.data && res.data[0]) || null
}

async function resolveAuditUser(event = {}, collectionProvider = db) {
  const userId = normalizeText(event.userId)
  const openid = normalizeText(event.openid)

  let user = null
  if (userId) {
    user = await getUserById(userId, collectionProvider)
    if (user && openid && user._openid !== openid) {
      throw new Error('用户信息不匹配')
    }
  }

  if (!user && openid) {
    user = await getUserByOpenid(openid, collectionProvider)
  }

  return user
}

function normalizeAdjustMode(mode, fallback = 'set') {
  const text = normalizeText(mode)
  return text === 'delta' ? 'delta' : fallback
}

async function createUserAdjustLog(transaction, payload = {}) {
  await transaction.collection(USER_ADJUST_LOG_COLLECTION).add({
    data: {
      userId: normalizeText(payload.userId),
      userOpenid: normalizeText(payload.userOpenid),
      operatorOpenid: normalizeText(payload.operatorOpenid),
      type: normalizeText(payload.type),
      adjustMode: normalizeAdjustMode(payload.adjustMode),
      beforeValue: payload.beforeValue,
      deltaValue: payload.deltaValue,
      afterValue: payload.afterValue,
      reason: normalizeText(payload.reason),
      createTime: db.serverDate()
    }
  })
}

async function ensureMerchantAuthorized(openid) {
  if (!openid) {
    throw new Error('请先登录商家账号')
  }

  const res = await db.collection('admin').where({
    openid
  }).limit(1).get()

  if (!res.data || !res.data[0]) {
    throw new Error('请先登录商家账号')
  }
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

async function listDishes(event = {}) {
  const categoryId = normalizeText(event.categoryId)
  const pageSize = Math.max(1, Math.min(50, toSafeInt(event.pageSize, 20)))
  const page = Math.max(0, toSafeInt(event.page, 0))

  if (!categoryId) {
    return {
      success: true,
      data: {
        list: [],
        hasMore: false
      }
    }
  }

  const res = await db.collection('dish')
    .where({
      categoryId
    })
    .orderBy('sort', 'asc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()

  const list = res.data || []
  return {
    success: true,
    data: {
      list,
      hasMore: list.length === pageSize
    }
  }
}

async function saveCategory(event = {}) {
  const category = event.category || {}
  const categoryId = normalizeText(category._id)
  const payload = {
    name: normalizeText(category.name),
    sort: toSafeInt(category.sort, 0),
    updateTime: db.serverDate()
  }

  if (!payload.name) {
    throw new Error('分类名称不能为空')
  }

  if (categoryId) {
    await db.collection('dishCategory').doc(categoryId).update({
      data: payload
    })

    return {
      success: true,
      data: {
        _id: categoryId
      }
    }
  }

  const addRes = await db.collection('dishCategory').add({
    data: {
      ...payload,
      createTime: db.serverDate()
    }
  })

  return {
    success: true,
    data: {
      _id: addRes._id
    }
  }
}

async function deleteCategory(event = {}) {
  const categoryId = normalizeText(event.categoryId)
  if (!categoryId) {
    throw new Error('分类ID不能为空')
  }

  const dishRes = await db.collection('dish').where({
    categoryId
  }).limit(1).get()

  if (dishRes.data && dishRes.data.length > 0) {
    throw new Error('该分类下仍有关联菜品，无法删除')
  }

  await db.collection('dishCategory').doc(categoryId).remove()
  return { success: true }
}

async function toggleDishStatus(event = {}) {
  const dishId = normalizeText(event.dishId)
  if (!dishId) {
    throw new Error('菜品ID不能为空')
  }

  await db.collection('dish').doc(dishId).update({
    data: {
      status: Number(event.status) === 0 ? 0 : 1,
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

async function saveDish(event = {}) {
  const dish = event.dish || {}
  const dishId = normalizeText(dish._id)
  const payload = buildDishPayload(dish)
  let category = null

  if (!payload.name) {
    throw new Error('菜品名称不能为空')
  }

  if (!payload.image) {
    throw new Error('菜品图片不能为空')
  }

  if (!payload.categoryId) {
    throw new Error('菜品分类不能为空')
  }

  category = await getDishCategoryById(payload.categoryId)

  if (!category) {
    throw new Error('菜品分类不存在或已删除')
  }

  payload.price = parseNumberField(dish.price, '售价', {
    required: true,
    min: 0,
    max: 10000,
    minMessage: '售价不能为负数',
    maxMessage: '售价最高10000'
  })
  payload.originalPrice = parseNumberField(dish.originalPrice, '原价', {
    required: true,
    min: 0,
    max: 10000,
    minMessage: '原价不能为负数',
    maxMessage: '原价最高10000'
  })

  if (payload.originalPrice < payload.price) {
    throw new Error('原价不能小于售价')
  }

  payload.categoryName = normalizeText(category.name)

  if (dishId) {
    await db.collection('dish').doc(dishId).update({
      data: payload
    })
    return { success: true }
  }

  await db.collection('dish').add({
    data: {
      ...payload,
      createTime: db.serverDate()
    }
  })

  return { success: true }
}

async function deleteDish(event = {}) {
  const dishId = normalizeText(event.dishId)
  if (!dishId) {
    throw new Error('菜品ID不能为空')
  }

  await db.collection('dish').doc(dishId).remove()
  return { success: true }
}

async function listNotices() {
  const res = await db.collection('notice')
    .orderBy('sort', 'asc')
    .get()

  return {
    success: true,
    data: {
      list: res.data || []
    }
  }
}

async function saveNotice(event = {}) {
  const notice = event.notice || {}
  const noticeId = normalizeText(notice._id)
  const payload = {
    content: normalizeText(notice.content),
    status: Number(notice.status) === 0 ? 0 : 1,
    sort: toSafeInt(notice.sort, 0),
    updateTime: db.serverDate()
  }

  if (!payload.content) {
    throw new Error('公告内容不能为空')
  }

  if (!noticeId) {
    const existingNotice = await getCollectionFirstRecord('notice')
    if (existingNotice) {
      throw new Error('只能设置一条公告')
    }
  }

  if (noticeId) {
    await db.collection('notice').doc(noticeId).update({
      data: payload
    })
    return { success: true }
  }

  await db.collection('notice').add({
    data: {
      ...payload,
      createTime: db.serverDate()
    }
  })

  return { success: true }
}

async function toggleNoticeStatus(event = {}) {
  const noticeId = normalizeText(event.noticeId)
  if (!noticeId) {
    throw new Error('公告ID不能为空')
  }

  await db.collection('notice').doc(noticeId).update({
    data: {
      status: Number(event.status) === 0 ? 0 : 1,
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

async function deleteNotice(event = {}) {
  const noticeId = normalizeText(event.noticeId)
  if (!noticeId) {
    throw new Error('公告ID不能为空')
  }

  await db.collection('notice').doc(noticeId).remove()
  return { success: true }
}

async function listRechargeOptions(event = {}) {
  const pageSize = Math.max(1, Math.min(50, toSafeInt(event.pageSize, 20)))
  const page = Math.max(0, toSafeInt(event.page, 0))
  const res = await db.collection('rechargeOptions')
    .orderBy('amount', 'asc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()

  const list = res.data || []
  return {
    success: true,
    data: {
      list,
      hasMore: list.length === pageSize
    }
  }
}

async function saveRechargeOption(event = {}) {
  const option = event.option || {}
  const optionId = normalizeText(option._id)
  const payload = {
    amount: toSafeNumber(option.amount, 0),
    giveAmount: toSafeNumber(option.giveAmount, 0),
    isRecommend: !!option.isRecommend,
    status: Number(option.status) === 0 ? 0 : 1,
    description: normalizeText(option.description),
    updateTime: db.serverDate()
  }

  payload.amount = parseNumberField(option.amount, '充值金额', {
    required: true,
    min: 0,
    minMessage: '充值金额不能为负数'
  })
  payload.giveAmount = parseNumberField(option.giveAmount, '赠送金额', {
    defaultValue: 0,
    min: 0,
    minMessage: '赠送金额不能为负数'
  })

  if (payload.amount <= 0) {
    throw new Error('充值金额不合法')
  }

  if (optionId) {
    await db.collection('rechargeOptions').doc(optionId).update({
      data: payload
    })
    return { success: true }
  }

  await db.collection('rechargeOptions').add({
    data: {
      ...payload,
      createTime: db.serverDate()
    }
  })

  return { success: true }
}

async function deleteRechargeOption(event = {}) {
  const optionId = normalizeText(event.optionId)
  if (!optionId) {
    throw new Error('充值选项ID不能为空')
  }

  await db.collection('rechargeOptions').doc(optionId).remove()
  return { success: true }
}

async function getShopInfo() {
  const res = await db.collection('shopInfo').limit(1).get()
  const shopInfo = buildShopInfo((res.data && res.data[0]) || {})

  return {
    success: true,
    data: {
      shopInfo
    }
  }
}

async function saveShopInfo(event = {}) {
  const shopInfo = event.shopInfo || {}
  const shopInfoId = normalizeText(shopInfo._id)
  const payload = {
    name: normalizeText(shopInfo.name),
    description: normalizeText(shopInfo.description),
    phone: normalizeText(shopInfo.phone),
    addressText: normalizeText(shopInfo.addressText),
    deliveryEnabled: shopInfo.deliveryEnabled !== false,
    deliveryFee: toSafeNumber(shopInfo.deliveryFee, 0),
    freeDeliveryThreshold: toSafeNumber(shopInfo.freeDeliveryThreshold, 0),
    businessHours: normalizeText(shopInfo.businessHours),
    notice: normalizeText(shopInfo.notice),
    posterBgUrl: normalizeText(shopInfo.posterBgUrl),
    updateTime: db.serverDate()
  }
  const existingShopInfo = await getCollectionFirstRecord('shopInfo')

  if (!payload.name) {
    throw new Error('店铺名称不能为空')
  }

  payload.deliveryFee = parseNumberField(shopInfo.deliveryFee, '配送费', {
    defaultValue: 0,
    min: 0,
    minMessage: '配送费不能为负数'
  })
  payload.freeDeliveryThreshold = parseNumberField(shopInfo.freeDeliveryThreshold, '免配送费门槛', {
    defaultValue: 0,
    min: 0,
    minMessage: '免配送费门槛不能为负数'
  })

  if (shopInfoId && existingShopInfo && existingShopInfo._id !== shopInfoId) {
    throw new Error('店铺信息已存在，请刷新后重试')
  }

  let targetId = shopInfoId || (existingShopInfo && existingShopInfo._id) || ''

  if (targetId) {
    await db.collection('shopInfo').doc(targetId).update({
      data: payload
    })
  } else {
    const addRes = await db.collection('shopInfo').add({
      data: {
        ...payload,
        createTime: db.serverDate()
      }
    })
    targetId = addRes._id
  }

  return {
    success: true,
    data: {
      _id: targetId
    }
  }
}

function buildStorePayload(store = {}) {
  return {
    name: normalizeText(store.name),
    description: normalizeText(store.description),
    phone: normalizeText(store.phone),
    addressText: normalizeText(store.addressText),
    deliveryEnabled: store.deliveryEnabled !== false,
    pickupEnabled: store.pickupEnabled !== false,
    deliveryFee: toSafeNumber(store.deliveryFee, 0),
    freeDeliveryThreshold: toSafeNumber(store.freeDeliveryThreshold, 0),
    businessHours: normalizeText(store.businessHours),
    notice: normalizeText(store.notice),
    posterBgUrl: normalizeText(store.posterBgUrl),
    status: normalizeText(store.status) || 'open',
    sort: toSafeInt(store.sort, 0),
    isDefault: !!store.isDefault,
    updateTime: db.serverDate()
  }
}

async function queryStoreList() {
  try {
    const res = await db.collection('store')
      .orderBy('sort', 'asc')
      .get()
    return (res.data || []).map(buildShopInfo)
  } catch (err) {
    return []
  }
}

async function listStores() {
  const stores = await queryStoreList()
  if (stores.length > 0) {
    return {
      success: true,
      data: {
        list: stores
      }
    }
  }

  const shopInfo = await getCollectionFirstRecord('shopInfo')
  const legacyStore = shopInfo
    ? {
        ...buildShopInfo(shopInfo),
        _id: shopInfo._id || 'legacy-shop',
        legacy: true,
        isDefault: true
      }
    : null

  return {
    success: true,
    data: {
      list: legacyStore ? [legacyStore] : []
    }
  }
}

async function mirrorDefaultStoreToShopInfo(storePayload = {}, storeId = '') {
  if (!storePayload.isDefault) {
    const existingStores = await queryStoreList()
    if (existingStores.length > 0 && existingStores.some(item => item.isDefault)) {
      return
    }
  }

  const shopInfo = await getCollectionFirstRecord('shopInfo')
  const payload = {
    ...storePayload,
    updateTime: db.serverDate()
  }
  delete payload.sort
  delete payload.isDefault
  delete payload.status

  if (shopInfo && shopInfo._id) {
    await db.collection('shopInfo').doc(shopInfo._id).update({
      data: payload
    })
    return
  }

  await db.collection('shopInfo').add({
    data: {
      ...payload,
      storeId,
      createTime: db.serverDate()
    }
  })
}

async function saveStore(event = {}) {
  const store = event.store || {}
  const storeId = normalizeText(store._id)
  const isLegacyStore = !!store.legacy || storeId === 'legacy-shop'
  const payload = buildStorePayload(store)

  if (!payload.name) {
    throw new Error('门店名称不能为空')
  }

  payload.deliveryFee = parseNumberField(store.deliveryFee, '配送费', {
    defaultValue: 0,
    min: 0,
    minMessage: '配送费不能为负数'
  })
  payload.freeDeliveryThreshold = parseNumberField(store.freeDeliveryThreshold, '免配送费门槛', {
    defaultValue: 0,
    min: 0,
    minMessage: '免配送费门槛不能为负数'
  })

  let targetId = ''
  if (storeId && !isLegacyStore) {
    await db.collection('store').doc(storeId).update({
      data: payload
    })
    targetId = storeId
  } else {
    const addRes = await db.collection('store').add({
      data: {
        ...payload,
        createTime: db.serverDate()
      }
    })
    targetId = addRes._id
  }

  if (payload.isDefault) {
    await db.collection('store').where({
      _id: _.neq(targetId)
    }).update({
      data: {
        isDefault: false,
        updateTime: db.serverDate()
      }
    })
  }

  await mirrorDefaultStoreToShopInfo(payload, targetId)

  return {
    success: true,
    data: {
      _id: targetId
    }
  }
}

async function deleteStore(event = {}) {
  const storeId = normalizeText(event.storeId)
  if (!storeId || storeId === 'legacy-shop') {
    throw new Error('门店ID不能为空')
  }

  const orderRes = await db.collection('order').where({
    storeId
  }).limit(1).get()

  if (orderRes.data && orderRes.data.length > 0) {
    throw new Error('该门店已有订单，不能删除')
  }

  await db.collection('store').doc(storeId).remove()
  return { success: true }
}

async function listTableCodes() {
  const res = await db.collection('tableCode')
    .orderBy('createTime', 'desc')
    .get()

  return {
    success: true,
    data: {
      list: res.data || []
    }
  }
}

async function createTableCode(event = {}) {
  const tableNumber = normalizeText(event.tableNumber)
  const qrCodeUrl = normalizeText(event.qrCodeUrl)

  if (!tableNumber) {
    throw new Error('入口码不能为空')
  }

  if (!qrCodeUrl) {
    throw new Error('小程序码地址不能为空')
  }

  const existsRes = await db.collection('tableCode').where({
    tableNumber
  }).limit(1).get()

  if (existsRes.data && existsRes.data.length > 0) {
    throw new Error('该入口码已存在')
  }

  const addRes = await db.collection('tableCode').add({
    data: {
      tableNumber,
      qrCodeUrl,
      posterUrl: '',
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  return {
    success: true,
    data: {
      _id: addRes._id
    }
  }
}

async function updateTablePoster(event = {}) {
  const tableCodeId = normalizeText(event.tableCodeId)
  const posterUrl = normalizeText(event.posterUrl)

  if (!tableCodeId) {
    throw new Error('入口码ID不能为空')
  }

  await db.collection('tableCode').doc(tableCodeId).update({
    data: {
      posterUrl,
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

async function deleteTableCode(event = {}) {
  const tableCodeId = normalizeText(event.tableCodeId)
  if (!tableCodeId) {
    throw new Error('入口码ID不能为空')
  }

  await db.collection('tableCode').doc(tableCodeId).remove()
  return { success: true }
}

async function getPrinterInfo() {
  const res = await db.collection('printer').limit(1).get()
  const printer = res.data && res.data[0]

  if (!printer) {
    return {
      success: true,
      data: {
        printerInfo: null
      }
    }
  }

  const { key, ...printerInfo } = printer
  return {
    success: true,
    data: {
      printerInfo
    }
  }
}

async function savePrinter(event = {}) {
  const printer = event.printer || {}
  const existsRes = await db.collection('printer').limit(1).get()

  if (existsRes.data && existsRes.data.length > 0) {
    throw new Error('已绑定打印机，请先解绑')
  }

  await db.collection('printer').add({
    data: {
      sn: normalizeText(printer.sn),
      key: normalizeText(printer.key),
      name: normalizeText(printer.name),
      density: toSafeInt(printer.density, 6),
      printSpeed: toSafeInt(printer.printSpeed, 2),
      volume: toSafeInt(printer.volume, 3),
      createTime: db.serverDate(),
      updateTime: db.serverDate()
    }
  })

  return { success: true }
}

async function deletePrinter(event = {}) {
  const printerId = normalizeText(event.printerId)
  if (!printerId) {
    throw new Error('打印机ID不能为空')
  }

  await db.collection('printer').doc(printerId).remove()
  return { success: true }
}

async function updatePrinterSettings(event = {}) {
  const printerId = normalizeText(event.printerId)
  const patch = event.patch || {}

  if (!printerId) {
    throw new Error('打印机ID不能为空')
  }

  const data = {
    updateTime: db.serverDate()
  }

  if (patch.density !== undefined) {
    data.density = toSafeInt(patch.density, 6)
  }
  if (patch.printSpeed !== undefined) {
    data.printSpeed = toSafeInt(patch.printSpeed, 2)
  }
  if (patch.volume !== undefined) {
    data.volume = toSafeInt(patch.volume, 3)
  }

  await db.collection('printer').doc(printerId).update({
    data
  })

  return { success: true }
}

async function getUserMiandan(event = {}) {
  const openid = normalizeText(event.openid)
  if (!openid) {
    throw new Error('用户标识不能为空')
  }

  const res = await db.collection('freeBuy').where({
    _openid: openid
  }).limit(1).get()

  return {
    success: true,
    data: {
      count: res.data && res.data.length > 0 ? toSafeInt(res.data[0].count, 0) : 0
    }
  }
}

async function updateUserBalance(event = {}) {
  const adjustMode = normalizeAdjustMode(event.adjustMode, event.delta !== undefined ? 'delta' : 'set')
  const reason = normalizeText(event.reason)

  if (!reason) {
    throw new Error('请输入调整备注')
  }

  const result = await db.runTransaction(async transaction => {
    const user = await resolveAuditUser(event, transaction)
    if (!user || !user._id) {
      throw new Error('用户不存在')
    }

    const beforeValue = roundMoney(user.balance)
    let afterValue = beforeValue
    let deltaValue = 0

    if (adjustMode === 'delta') {
      deltaValue = roundMoney(parseNumberField(event.delta, '余额调整值', {
        required: true,
        min: -100000,
        max: 100000,
        minMessage: '余额调整值不能小于-100000',
        maxMessage: '余额调整值不能大于100000'
      }))

      if (deltaValue === 0) {
        throw new Error('调整值不能为0')
      }

      afterValue = roundMoney(beforeValue + deltaValue)
    } else {
      afterValue = roundMoney(parseNumberField(event.balance, '余额', {
        required: true,
        min: 0,
        max: 100000,
        minMessage: '余额不能为负数',
        maxMessage: '余额最高100000'
      }))
      deltaValue = roundMoney(afterValue - beforeValue)
    }

    if (afterValue < 0) {
      throw new Error('调整后余额不能为负数')
    }

    await transaction.collection('user').doc(user._id).update({
      data: {
        balance: afterValue,
        updateTime: db.serverDate()
      }
    })

    await createUserAdjustLog(transaction, {
      userId: user._id,
      userOpenid: user._openid,
      operatorOpenid: normalizeText(event.operatorOpenid),
      type: 'balance',
      adjustMode,
      beforeValue,
      deltaValue,
      afterValue,
      reason
    })

    return {
      beforeValue,
      deltaValue,
      afterValue
    }
  })

  return {
    success: true,
    data: result
  }
}

async function updateUserMiandan(event = {}) {
  const adjustMode = normalizeAdjustMode(event.adjustMode, event.delta !== undefined ? 'delta' : 'set')
  const reason = normalizeText(event.reason)

  if (!reason) {
    throw new Error('请输入调整备注')
  }

  const result = await db.runTransaction(async transaction => {
    const user = await resolveAuditUser(event, transaction)
    if (!user || !user._id || !user._openid) {
      throw new Error('用户不存在')
    }

    const freeBuyRes = await transaction.collection('freeBuy').where({
      _openid: user._openid
    }).limit(1).get()
    const freeBuyRecord = freeBuyRes.data && freeBuyRes.data[0]
    const beforeValue = Math.max(0, toSafeInt(freeBuyRecord && freeBuyRecord.count, 0))

    let afterValue = beforeValue
    let deltaValue = 0

    if (adjustMode === 'delta') {
      deltaValue = toSafeInt(parseNumberField(event.delta, '免单次数调整值', {
        required: true,
        min: -9999,
        max: 9999,
        minMessage: '免单次数调整值不能小于-9999',
        maxMessage: '免单次数调整值不能大于9999'
      }), 0)

      if (deltaValue === 0) {
        throw new Error('调整值不能为0')
      }

      afterValue = beforeValue + deltaValue
    } else {
      afterValue = Math.max(0, toSafeInt(event.count, 0))
      deltaValue = afterValue - beforeValue
    }

    if (afterValue < 0) {
      throw new Error('调整后免单次数不能为负数')
    }

    if (freeBuyRecord) {
      await transaction.collection('freeBuy').doc(freeBuyRecord._id).update({
        data: {
          count: afterValue,
          updateTime: db.serverDate()
        }
      })
    } else {
      await transaction.collection('freeBuy').add({
        data: {
          _openid: user._openid,
          count: afterValue,
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }
      })
    }

    await createUserAdjustLog(transaction, {
      userId: user._id,
      userOpenid: user._openid,
      operatorOpenid: normalizeText(event.operatorOpenid),
      type: 'miandan',
      adjustMode,
      beforeValue,
      deltaValue,
      afterValue,
      reason
    })

    return {
      beforeValue,
      deltaValue,
      afterValue
    }
  })

  return {
    success: true,
    data: result
  }
}

async function listOrders(event = {}) {
  await cleanupExpiredPendingOrders()

  const orderType = toSafeInt(event.orderType, 0)
  const pageSize = Math.max(1, Math.min(50, toSafeInt(event.pageSize, 20)))
  const page = Math.max(0, toSafeInt(event.page, 0))
  const includeUnpaid = event.includeUnpaid !== false
  const where = {}

  if (!includeUnpaid) {
    where.pay_status = true
  }

  if (orderType === 1) {
    where.type = 'recharge'
  } else if (orderType === 2) {
    where.type = 'order'
  }

  const res = await db.collection('order')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get()

  const list = res.data || []
  return {
    success: true,
    data: {
      list,
      hasMore: list.length === pageSize
    }
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const action = normalizeText(event.action)

  try {
    await ensureMerchantAuthorized(OPENID)

    switch (action) {
      case 'listDishes':
        return await listDishes(event)
      case 'saveCategory':
        return await saveCategory(event)
      case 'deleteCategory':
        return await deleteCategory(event)
      case 'toggleDishStatus':
        return await toggleDishStatus(event)
      case 'saveDish':
        return await saveDish(event)
      case 'deleteDish':
        return await deleteDish(event)
      case 'listNotices':
        return await listNotices()
      case 'saveNotice':
        return await saveNotice(event)
      case 'toggleNoticeStatus':
        return await toggleNoticeStatus(event)
      case 'deleteNotice':
        return await deleteNotice(event)
      case 'listRechargeOptions':
        return await listRechargeOptions(event)
      case 'saveRechargeOption':
        return await saveRechargeOption(event)
      case 'deleteRechargeOption':
        return await deleteRechargeOption(event)
      case 'getShopInfo':
        return await getShopInfo()
      case 'saveShopInfo':
        return await saveShopInfo(event)
      case 'listStores':
        return await listStores()
      case 'saveStore':
        return await saveStore(event)
      case 'deleteStore':
        return await deleteStore(event)
      case 'listTableCodes':
        return await listTableCodes()
      case 'createTableCode':
        return await createTableCode(event)
      case 'updateTablePoster':
        return await updateTablePoster(event)
      case 'deleteTableCode':
        return await deleteTableCode(event)
      case 'getPrinterInfo':
        return await getPrinterInfo()
      case 'savePrinter':
        return await savePrinter(event)
      case 'deletePrinter':
        return await deletePrinter(event)
      case 'updatePrinterSettings':
        return await updatePrinterSettings(event)
      case 'getUserMiandan':
        return await getUserMiandan(event)
      case 'updateUserBalance':
        return await updateUserBalance({
          ...event,
          operatorOpenid: OPENID
        })
      case 'updateUserMiandan':
        return await updateUserMiandan({
          ...event,
          operatorOpenid: OPENID
        })
      case 'listOrders':
        return await listOrders(event)
      default:
        return {
          success: false,
          error: '未知操作'
        }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
