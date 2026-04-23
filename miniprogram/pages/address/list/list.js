const db = wx.cloud.database()

Page({
  data: {
    addresses: [],
    loading: false,
    from: ''
  },

  onLoad(options) {
    this.setData({
      from: options.from || ''
    })
    this.loadAddresses()
  },

  onShow() {
    this.loadAddresses()
  },

  async loadAddresses() {
    if (this.data.loading) return

    this.setData({ loading: true })

    try {
      const res = await wx.cloud.callFunction({
        name: 'addressList'
      })

      const result = res.result || {}
      this.setData({
        addresses: result.success ? (result.data || []) : []
      })
    } catch (err) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  stopPropagation() {},

  addAddress() {
    wx.navigateTo({
      url: '/pages/address/edit/edit?from=' + encodeURIComponent(this.data.from || '')
    })
  },

  editAddress(e) {
    const addressId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/address/edit/edit?id=${addressId}&from=${encodeURIComponent(this.data.from || '')}`
    })
  },

  async setDefaultAddress(e) {
    const addressId = e.currentTarget.dataset.id

    try {
      wx.showLoading({ title: '处理中...' })
      const res = await wx.cloud.callFunction({
        name: 'addressSetDefault',
        data: {
          addressId
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '设置失败')
      }

      wx.hideLoading()
      wx.showToast({
        title: '已设为默认',
        icon: 'success'
      })
      this.loadAddresses()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '设置失败',
        icon: 'none'
      })
    }
  },

  async deleteAddress(e) {
    const addressId = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个地址吗？',
      success: async (res) => {
        if (!res.confirm) return

        try {
          wx.showLoading({ title: '删除中...' })
          const result = await wx.cloud.callFunction({
            name: 'addressDelete',
            data: {
              addressId
            }
          })

          if (!result.result || !result.result.success) {
            throw new Error(result.result?.error || '删除失败')
          }

          wx.hideLoading()
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
          this.loadAddresses()
        } catch (err) {
          wx.hideLoading()
          wx.showToast({
            title: err.message || '删除失败',
            icon: 'none'
          })
        }
      }
    })
  },

  chooseAddress(e) {
    const addressId = e.currentTarget.dataset.id
    const address = this.data.addresses.find(item => item._id === addressId)

    if (this.data.from === 'settle' && address) {
      wx.setStorageSync('settleSelectedAddressId', address._id)
      wx.navigateBack()
    }
  }
})
