const db = wx.cloud.database()

Page({
  data: {
    addressId: '',
    from: '',
    name: '',
    mobile: '',
    region: [],
    regionText: '',
    detail: '',
    isDefault: false,
    label: '',
    loading: false
  },

  onLoad(options) {
    this.setData({
      addressId: options.id || '',
      from: options.from || ''
    })

    if (options.id) {
      this.loadAddress(options.id)
    }
  },

  async loadAddress(addressId) {
    try {
      wx.showLoading({ title: '加载中...' })
      const res = await wx.cloud.callFunction({
        name: 'addressList'
      })

      const list = (res.result && res.result.success && res.result.data) ? res.result.data : []
      const address = list.find(item => item._id === addressId)

      if (!address) {
        throw new Error('地址不存在')
      }

      this.setData({
        name: address.name || '',
        mobile: address.mobile || '',
        region: [address.province || '', address.city || '', address.district || ''],
        regionText: [address.province || '', address.city || '', address.district || ''].filter(Boolean).join(' '),
        detail: address.detail || '',
        isDefault: !!address.isDefault,
        label: address.label || ''
      })
    } catch (err) {
      wx.showToast({
        title: err.message || '加载失败',
        icon: 'none'
      })
      setTimeout(() => {
        wx.navigateBack()
      }, 1200)
    } finally {
      wx.hideLoading()
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onMobileInput(e) {
    this.setData({ mobile: e.detail.value })
  },

  onDetailInput(e) {
    this.setData({ detail: e.detail.value })
  },

  onLabelInput(e) {
    this.setData({ label: e.detail.value })
  },

  onDefaultChange(e) {
    this.setData({ isDefault: !!e.detail.value })
  },

  onRegionChange(e) {
    const region = e.detail.value || []
    this.setData({
      region,
      regionText: region.filter(Boolean).join(' ')
    })
  },

  async saveAddress() {
    if (this.data.loading) {
      return
    }

    const { addressId, name, mobile, region, detail, isDefault, label } = this.data

    if (!name.trim()) {
      wx.showToast({ title: '请输入收货人姓名', icon: 'none' })
      return
    }

    if (!/^1\d{10}$/.test(mobile.trim())) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' })
      return
    }

    if (!Array.isArray(region) || region.length < 3) {
      wx.showToast({ title: '请选择完整地区', icon: 'none' })
      return
    }

    if (!detail.trim()) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' })
      return
    }

    try {
      this.setData({ loading: true })
      wx.showLoading({ title: '保存中...' })

      const res = await wx.cloud.callFunction({
        name: 'addressUpsert',
        data: {
          addressId,
          name: name.trim(),
          mobile: mobile.trim(),
          region,
          detail: detail.trim(),
          isDefault,
          label
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '保存失败')
      }

      if (this.data.from === 'settle') {
        wx.setStorageSync('settleSelectedAddressId', res.result.addressId || addressId)
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      setTimeout(() => {
        wx.navigateBack()
      }, 800)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    } finally {
      this.setData({ loading: false })
    }
  }
})
