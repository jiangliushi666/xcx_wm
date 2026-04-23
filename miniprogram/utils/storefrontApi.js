/**
 * 店铺API模块
 * 提供店铺信息、菜品、充值选项等数据的获取功能
 */

/**
 * 调用店铺云函数
 * @param {string} action - 操作类型
 * @param {Object} data - 请求数据
 * @returns {Promise<Object>} 云函数返回结果
 */
function callStorefront(action, data = {}) {
  return wx.cloud.callFunction({
    name: 'storefront',
    data: {
      action,
      ...data
    }
  }).then(res => res.result || {})
}

/**
 * 获取首页数据
 * @returns {Promise<Object>} 首页数据对象
 * @returns {Object} returns.shopInfo - 店铺信息
 * @returns {Array} returns.notices - 公告列表
 * @returns {Array} returns.categories - 分类列表
 * @throws {Error} 加载失败时抛出错误
 */
async function getStorefrontHome(options = {}) {
  const result = await callStorefront('home', {
    storeId: options.storeId || ''
  })
  if (!result.success) {
    throw new Error(result.error || '加载首页数据失败')
  }

  return result.data || {
    shopInfo: {},
    selectedStore: null,
    selectedStoreId: '',
    stores: [],
    notices: [],
    categories: []
  }
}

/**
 * 获取可选门店列表
 * @param {Object} options - 查询选项
 * @param {string} [options.storeId] - 当前选中门店ID
 * @returns {Promise<Object>} 门店列表数据
 */
async function getStorefrontStores(options = {}) {
  const result = await callStorefront('stores', {
    storeId: options.storeId || ''
  })

  if (!result.success) {
    throw new Error(result.error || '加载门店失败')
  }

  return result.data || {
    list: [],
    selectedStore: null,
    selectedStoreId: ''
  }
}

/**
 * 获取店铺信息
 * @returns {Promise<Object>} 店铺信息对象
 * @returns {string} returns.name - 店铺名称
 * @returns {string} returns.phone - 联系电话
 * @returns {string} returns.addressText - 地址文本
 * @returns {boolean} returns.deliveryEnabled - 是否开启配送
 * @returns {number} returns.deliveryFee - 配送费
 * @returns {number} returns.freeDeliveryThreshold - 免配送费门槛
 * @throws {Error} 加载失败时抛出错误
 */
async function getStorefrontShopInfo(options = {}) {
  const result = await callStorefront('shopInfo', {
    storeId: options.storeId || ''
  })
  if (!result.success) {
    throw new Error(result.error || '加载店铺信息失败')
  }

  return (result.data && result.data.shopInfo) || {}
}

/**
 * 获取菜品列表
 * @param {Object} options - 查询选项
 * @param {string} [options.categoryId] - 分类ID
 * @param {number} [options.page=0] - 页码（从0开始）
 * @param {number} [options.pageSize=20] - 每页数量
 * @returns {Promise<Object>} 菜品列表数据
 * @returns {Array} returns.list - 菜品列表
 * @returns {number} returns.page - 当前页码
 * @returns {number} returns.pageSize - 每页数量
 * @returns {boolean} returns.hasMore - 是否还有更多数据
 * @throws {Error} 加载失败时抛出错误
 */
async function getStorefrontDishes(options = {}) {
  const result = await callStorefront('dishes', {
    storeId: options.storeId || '',
    categoryId: options.categoryId || '',
    page: options.page || 0,
    pageSize: options.pageSize || 20
  })

  if (!result.success) {
    throw new Error(result.error || '加载菜品失败')
  }

  return result.data || {
    list: [],
    page: 0,
    pageSize: options.pageSize || 20,
    hasMore: false
  }
}

/**
 * 获取充值套餐列表
 * @param {Object} options - 查询选项
 * @param {number} [options.page=0] - 页码（从0开始）
 * @param {number} [options.pageSize=20] - 每页数量
 * @returns {Promise<Object>} 充值套餐列表数据
 * @returns {Array} returns.list - 套餐列表
 * @returns {number} returns.page - 当前页码
 * @returns {number} returns.pageSize - 每页数量
 * @returns {boolean} returns.hasMore - 是否还有更多数据
 * @throws {Error} 加载失败时抛出错误
 */
async function getStorefrontRechargeOptions(options = {}) {
  const result = await callStorefront('rechargeOptions', {
    page: options.page || 0,
    pageSize: options.pageSize || 20
  })

  if (!result.success) {
    throw new Error(result.error || '加载充值套餐失败')
  }

  return result.data || {
    list: [],
    page: 0,
    pageSize: options.pageSize || 20,
    hasMore: false
  }
}

module.exports = {
  callStorefront,
  getStorefrontHome,
  getStorefrontStores,
  getStorefrontShopInfo,
  getStorefrontDishes,
  getStorefrontRechargeOptions
}
