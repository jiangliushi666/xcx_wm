const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function toSafeInt(value, fallback = 0) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function buildShopInfo(shopInfo = {}) {
  return {
    _id: shopInfo._id || '',
    name: normalizeText(shopInfo.name),
    description: normalizeText(shopInfo.description),
    phone: normalizeText(shopInfo.phone),
    addressText: normalizeText(shopInfo.addressText),
    deliveryEnabled: shopInfo.deliveryEnabled !== false,
    pickupEnabled: shopInfo.pickupEnabled !== false,
    deliveryFee: toSafeNumber(shopInfo.deliveryFee, 0),
    freeDeliveryThreshold: toSafeNumber(shopInfo.freeDeliveryThreshold, 0),
    businessHours: normalizeText(shopInfo.businessHours),
    notice: normalizeText(shopInfo.notice),
    posterBgUrl: normalizeText(shopInfo.posterBgUrl),
    status: normalizeText(shopInfo.status) || 'open',
    sort: toSafeInt(shopInfo.sort, 0),
    isDefault: !!shopInfo.isDefault,
    legacy: !!shopInfo.legacy
  }
}

function buildStore(store = {}) {
  return buildShopInfo(store)
}

function buildNotice(notice = {}) {
  return {
    _id: notice._id || '',
    content: normalizeText(notice.content),
    sort: toSafeInt(notice.sort, 0)
  }
}

function buildCategory(category = {}) {
  return {
    _id: category._id || '',
    name: normalizeText(category.name),
    sort: toSafeInt(category.sort, 0)
  }
}

function buildDish(dish = {}) {
  const description = normalizeText(dish.description || dish.desc)

  return {
    _id: dish._id || '',
    name: normalizeText(dish.name),
    price: toSafeNumber(dish.price, 0),
    originalPrice: toSafeNumber(dish.originalPrice, 0),
    description,
    desc: description,
    categoryId: normalizeText(dish.categoryId),
    categoryName: normalizeText(dish.categoryName),
    image: normalizeText(dish.image),
    sort: toSafeInt(dish.sort, 0),
    tags: Array.isArray(dish.tags) ? dish.tags : [],
    canUseMiandan: !!dish.canUseMiandan
  }
}

function buildRechargeOption(option = {}) {
  return {
    _id: option._id || '',
    amount: toSafeNumber(option.amount, 0),
    giveAmount: toSafeNumber(option.giveAmount, 0),
    description: normalizeText(option.description),
    isRecommend: !!option.isRecommend
  }
}

function normalizePaging(event = {}) {
  const pageSize = Math.max(1, Math.min(50, toSafeInt(event.pageSize, 20)))
  const page = Math.max(0, toSafeInt(event.page, 0))

  return {
    page,
    pageSize,
    skip: page * pageSize
  }
}

async function queryStoreRecords() {
  try {
    const res = await db.collection('store')
      .orderBy('sort', 'asc')
      .limit(100)
      .get()

    return (res.data || [])
      .filter(item => normalizeText(item.status) !== 'disabled')
      .map(buildStore)
      .sort((a, b) => a.sort - b.sort)
  } catch (err) {
    return []
  }
}

async function loadLegacyStore() {
  const shopRes = await db.collection('shopInfo').limit(1).get()
  const shopInfo = buildShopInfo((shopRes.data && shopRes.data[0]) || {})

  if (!shopInfo._id && !shopInfo.name) {
    return null
  }

  return {
    ...shopInfo,
    _id: shopInfo._id || 'legacy-shop',
    legacy: true,
    isDefault: true
  }
}

async function loadStores() {
  const stores = await queryStoreRecords()
  if (stores.length > 0) {
    return stores
  }

  const legacyStore = await loadLegacyStore()
  return legacyStore ? [legacyStore] : []
}

async function resolveStore(storeId = '') {
  const stores = await loadStores()
  if (stores.length === 0) {
    return {
      stores: [],
      selectedStore: buildShopInfo({}),
      selectedStoreId: ''
    }
  }

  const normalizedStoreId = normalizeText(storeId)
  const selectedStore = stores.find(item => item._id === normalizedStoreId)
    || stores.find(item => item.isDefault)
    || stores[0]

  return {
    stores,
    selectedStore,
    selectedStoreId: selectedStore._id || ''
  }
}

async function loadHomeData(event = {}) {
  const storeContext = await resolveStore(event.storeId)
  const [noticeRes, categoryRes] = await Promise.all([
    db.collection('notice')
      .where({
        status: 1
      })
      .orderBy('sort', 'asc')
      .limit(10)
      .get(),
    db.collection('dishCategory')
      .orderBy('sort', 'asc')
      .limit(100)
      .get()
  ])

  return {
    success: true,
    data: {
      shopInfo: storeContext.selectedStore,
      selectedStore: storeContext.selectedStore,
      selectedStoreId: storeContext.selectedStoreId,
      stores: storeContext.stores,
      notices: (noticeRes.data || []).map(buildNotice),
      categories: (categoryRes.data || []).map(buildCategory)
    }
  }
}

async function loadShopInfo(event = {}) {
  const storeContext = await resolveStore(event.storeId)

  return {
    success: true,
    data: {
      shopInfo: storeContext.selectedStore,
      selectedStore: storeContext.selectedStore,
      selectedStoreId: storeContext.selectedStoreId,
      stores: storeContext.stores
    }
  }
}

async function loadStoreList(event = {}) {
  const storeContext = await resolveStore(event.storeId)

  return {
    success: true,
    data: {
      list: storeContext.stores,
      selectedStore: storeContext.selectedStore,
      selectedStoreId: storeContext.selectedStoreId
    }
  }
}

async function loadDishes(event = {}) {
  const categoryId = normalizeText(event.categoryId)
  const { page, pageSize, skip } = normalizePaging(event)

  if (!categoryId) {
    return {
      success: true,
      data: {
        list: [],
        page,
        pageSize,
        hasMore: false
      }
    }
  }

  const res = await db.collection('dish')
    .where({
      categoryId,
      status: 1
    })
    .orderBy('sort', 'asc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const list = (res.data || []).map(buildDish)

  return {
    success: true,
    data: {
      list,
      page,
      pageSize,
      hasMore: list.length === pageSize
    }
  }
}

async function loadRechargeOptions(event = {}) {
  const { page, pageSize, skip } = normalizePaging(event)

  const res = await db.collection('rechargeOptions')
    .where({
      status: 1
    })
    .orderBy('amount', 'asc')
    .skip(skip)
    .limit(pageSize)
    .get()

  const list = (res.data || []).map(buildRechargeOption)

  return {
    success: true,
    data: {
      list,
      page,
      pageSize,
      hasMore: list.length === pageSize
    }
  }
}

exports.main = async (event = {}) => {
  const action = normalizeText(event.action) || 'home'

  try {
    if (action === 'home') {
      return await loadHomeData(event)
    }

    if (action === 'stores') {
      return await loadStoreList(event)
    }

    if (action === 'shopInfo') {
      return await loadShopInfo(event)
    }

    if (action === 'dishes') {
      return await loadDishes(event)
    }

    if (action === 'rechargeOptions') {
      return await loadRechargeOptions(event)
    }

    return {
      success: false,
      error: '未知操作'
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '加载失败'
    }
  }
}
