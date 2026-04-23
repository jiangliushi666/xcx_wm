const {
  CACHE_KEY_SELECTED_STORE,
  CACHE_KEY_SELECTED_STORE_ID
} = require('./constants')

function normalizeStore(store = {}) {
  if (!store || !store._id) {
    return null
  }

  return {
    _id: store._id,
    name: store.name || '',
    description: store.description || '',
    phone: store.phone || '',
    addressText: store.addressText || '',
    deliveryEnabled: store.deliveryEnabled !== false,
    pickupEnabled: store.pickupEnabled !== false,
    deliveryFee: Number(store.deliveryFee || 0),
    freeDeliveryThreshold: Number(store.freeDeliveryThreshold || 0),
    businessHours: store.businessHours || '',
    notice: store.notice || '',
    posterBgUrl: store.posterBgUrl || '',
    status: store.status || 'open',
    legacy: !!store.legacy
  }
}

function getSelectedStore() {
  try {
    return normalizeStore(wx.getStorageSync(CACHE_KEY_SELECTED_STORE))
  } catch (err) {
    return null
  }
}

function getSelectedStoreId() {
  try {
    const storeId = wx.getStorageSync(CACHE_KEY_SELECTED_STORE_ID)
    if (storeId) {
      return String(storeId)
    }

    const store = getSelectedStore()
    return store ? store._id : ''
  } catch (err) {
    return ''
  }
}

function setSelectedStore(store) {
  const normalized = normalizeStore(store)
  if (!normalized) {
    clearSelectedStore()
    return null
  }

  wx.setStorageSync(CACHE_KEY_SELECTED_STORE, normalized)
  wx.setStorageSync(CACHE_KEY_SELECTED_STORE_ID, normalized._id)
  return normalized
}

function clearSelectedStore() {
  wx.removeStorageSync(CACHE_KEY_SELECTED_STORE)
  wx.removeStorageSync(CACHE_KEY_SELECTED_STORE_ID)
}

module.exports = {
  getSelectedStore,
  getSelectedStoreId,
  setSelectedStore,
  clearSelectedStore
}
