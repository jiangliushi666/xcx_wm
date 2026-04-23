const { withMerchantGuard } = require('../../../utils/merchantGuard')
const { callAdminApi } = require('../../../utils/adminApi')

function createEmptyStore() {
  return {
    _id: '',
    name: '',
    description: '',
    phone: '',
    addressText: '',
    deliveryEnabled: true,
    pickupEnabled: true,
    deliveryFee: 0,
    freeDeliveryThreshold: 0,
    businessHours: '',
    notice: '',
    posterBgUrl: '',
    status: 'open',
    sort: 0,
    isDefault: false,
    legacy: false
  }
}

Page(withMerchantGuard({
  data: {
    stores: [],
    currentStoreId: '',
    storeForm: createEmptyStore()
  },

  onLoad() {
    this.loadStores()
  },

  async loadStores() {
    try {
      wx.showLoading({ title: '加载中...' })
      const res = await callAdminApi('listStores')
      wx.hideLoading()

      const stores = res.success && res.data ? (res.data.list || []) : []
      const currentStore = stores.find(item => item._id === this.data.currentStoreId)
        || stores.find(item => item.isDefault)
        || stores[0]
        || createEmptyStore()

      this.setData({
        stores,
        currentStoreId: currentStore._id || '',
        storeForm: {
          ...createEmptyStore(),
          ...currentStore
        }
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  selectStore(e) {
    const storeId = e.currentTarget.dataset.id
    const store = this.data.stores.find(item => item._id === storeId)
    if (!store) return

    this.setData({
      currentStoreId: store._id,
      storeForm: {
        ...createEmptyStore(),
        ...store
      }
    })
  },

  createStore() {
    this.setData({
      currentStoreId: '',
      storeForm: {
        ...createEmptyStore(),
        sort: this.data.stores.length * 10
      }
    })
  },

  updateStoreField(field, value) {
    this.setData({
      [`storeForm.${field}`]: value
    })
  },

  onNameInput(e) {
    this.updateStoreField('name', e.detail.value)
  },

  onDescriptionInput(e) {
    this.updateStoreField('description', e.detail.value)
  },

  onPhoneInput(e) {
    this.updateStoreField('phone', e.detail.value)
  },

  onAddressInput(e) {
    this.updateStoreField('addressText', e.detail.value)
  },

  onBusinessHoursInput(e) {
    this.updateStoreField('businessHours', e.detail.value)
  },

  onNoticeInput(e) {
    this.updateStoreField('notice', e.detail.value)
  },

  onPosterBgInput(e) {
    this.updateStoreField('posterBgUrl', e.detail.value)
  },

  onDeliverySwitchChange(e) {
    this.updateStoreField('deliveryEnabled', !!e.detail.value)
  },

  onPickupSwitchChange(e) {
    this.updateStoreField('pickupEnabled', !!e.detail.value)
  },

  onDefaultSwitchChange(e) {
    this.updateStoreField('isDefault', !!e.detail.value)
  },

  onStatusSwitchChange(e) {
    this.updateStoreField('status', e.detail.value ? 'open' : 'closed')
  },

  onDeliveryFeeInput(e) {
    const value = Number(e.detail.value || 0)
    this.updateStoreField('deliveryFee', Number.isNaN(value) ? 0 : value)
  },

  onFreeDeliveryInput(e) {
    const value = Number(e.detail.value || 0)
    this.updateStoreField('freeDeliveryThreshold', Number.isNaN(value) ? 0 : value)
  },

  onSortInput(e) {
    const value = Number(e.detail.value || 0)
    this.updateStoreField('sort', Number.isNaN(value) ? 0 : value)
  },

  async saveShopInfo() {
    const { storeForm } = this.data
    const name = String(storeForm.name || '').trim()

    if (!name) {
      wx.showToast({
        title: '请输入门店名称',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      const saveRes = await callAdminApi('saveStore', {
        store: {
          ...storeForm,
          name
        }
      })

      if (!saveRes.success) {
        throw new Error(saveRes.error || '保存失败')
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.setData({
        currentStoreId: saveRes.data?._id || ''
      })
      this.loadStores()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    }
  },

  async deleteStore() {
    const { storeForm } = this.data
    if (!storeForm._id || storeForm.legacy) {
      wx.showToast({
        title: '当前门店不能删除',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '删除门店',
      content: `确认删除「${storeForm.name || '未命名门店'}」？已有订单的门店不能删除。`,
      success: async (res) => {
        if (!res.confirm) return

        try {
          wx.showLoading({ title: '删除中...' })
          const deleteRes = await callAdminApi('deleteStore', {
            storeId: storeForm._id
          })

          if (!deleteRes.success) {
            throw new Error(deleteRes.error || '删除失败')
          }

          wx.hideLoading()
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
          this.setData({
            currentStoreId: ''
          })
          this.loadStores()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({
            title: err.message || '删除失败',
            icon: 'none'
          })
        }
      }
    })
  }
}))
