const { getStorefrontStores } = require('../../../utils/storefrontApi')
const {
  getSelectedStoreId,
  setSelectedStore
} = require('../../../utils/storeSelection')

Page({
  data: {
    stores: [],
    selectedStoreId: '',
    loading: false
  },

  onLoad(options = {}) {
    const selectedStoreId = options.storeId || getSelectedStoreId()
    this.setData({
      selectedStoreId
    })
    this.loadStores()
  },

  async loadStores() {
    this.setData({ loading: true })
    wx.showLoading({ title: '加载中...' })

    try {
      const data = await getStorefrontStores({
        storeId: this.data.selectedStoreId
      })
      const stores = data.list || []
      const selectedStoreId = this.data.selectedStoreId || data.selectedStoreId || ''

      this.setData({
        stores,
        selectedStoreId
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载门店失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
      wx.hideLoading()
    }
  },

  chooseStore(e) {
    const storeId = e.currentTarget.dataset.id
    const store = this.data.stores.find(item => item._id === storeId)
    if (!store) {
      wx.showToast({
        title: '门店不存在',
        icon: 'none'
      })
      return
    }

    setSelectedStore(store)
    this.setData({
      selectedStoreId: store._id
    })

    wx.showToast({
      title: '已选择门店',
      icon: 'success',
      duration: 800
    })

    setTimeout(() => {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
        return
      }

      wx.switchTab({
        url: '/pages/index/index'
      })
    }, 500)
  },

  refreshStores() {
    this.loadStores()
  }
})
