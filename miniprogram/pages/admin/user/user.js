const { withMerchantGuard } = require('../../../utils/merchantGuard')
const { callAdminApi } = require('../../../utils/adminApi')

Page(withMerchantGuard({
  data: {
    users: [],
    searchKeyword: '',
    showBalanceModal: false,
    showMiandanModal: false,
    currentUser: null,
    editBalanceDelta: '',
    editBalanceReason: '',
    editMiandanDelta: '',
    editMiandanReason: '',
    userPage: 0,
    userPageSize: 20,
    userHasMore: true,
    loadingUsers: false
  },

  onLoad() {
    this.loadUsers()
  },

  onShow() {
    this.loadUsers()
  },

  async loadUsers(append = false) {
    if (this.data.loadingUsers) {
      return
    }

    if (!append) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ loadingUsers: true })

    try {
      const keyword = this.data.searchKeyword.trim()
      const pageSize = this.data.userPageSize
      const page = append ? this.data.userPage + 1 : 0
      const res = await wx.cloud.callFunction({
        name: 'getUserList',
        data: {
          keyword,
          page,
          pageSize
        }
      })

      if (!res.result || !res.result.success) {
        throw new Error(res.result?.error || '获取用户列表失败')
      }

      const { list = [], hasMore = false } = res.result.data || {}
      const newUsers = append ? this.data.users.concat(list) : list

      this.setData({
        users: newUsers,
        userPage: page,
        userHasMore: hasMore
      })
    } catch (err) {
      if (!append) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    } finally {
      if (!append) {
        wx.hideLoading()
      }
      this.setData({ loadingUsers: false })
    }
  },

  onReachBottom() {
    if (this.data.userHasMore && !this.data.loadingUsers) {
      this.loadUsers(true)
    }
  },

  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    })
  },

  doSearch() {
    this.loadUsers()
  },

  clearSearch() {
    this.setData({
      searchKeyword: '',
      userPage: 0,
      userHasMore: true,
      users: []
    }, () => {
      this.loadUsers()
    })
  },

  showEditBalanceModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showBalanceModal: true,
      currentUser: user,
      editBalanceDelta: '',
      editBalanceReason: ''
    })
  },

  closeBalanceModal() {
    this.setData({
      showBalanceModal: false,
      currentUser: null,
      editBalanceDelta: '',
      editBalanceReason: ''
    })
  },

  showEditMiandanModal(e) {
    const user = e.currentTarget.dataset.user
    this.setData({
      showMiandanModal: true,
      currentUser: user,
      editMiandanDelta: '',
      editMiandanReason: ''
    })
  },

  closeMiandanModal() {
    this.setData({
      showMiandanModal: false,
      currentUser: null,
      editMiandanDelta: '',
      editMiandanReason: ''
    })
  },

  stopPropagation() {},

  onBalanceDeltaInput(e) {
    this.setData({
      editBalanceDelta: e.detail.value
    })
  },

  onBalanceReasonInput(e) {
    this.setData({
      editBalanceReason: e.detail.value
    })
  },

  onMiandanDeltaInput(e) {
    this.setData({
      editMiandanDelta: e.detail.value
    })
  },

  onMiandanReasonInput(e) {
    this.setData({
      editMiandanReason: e.detail.value
    })
  },

  async saveBalance() {
    const { currentUser, editBalanceDelta, editBalanceReason } = this.data
    const delta = Number(editBalanceDelta)

    if (!Number.isFinite(delta) || delta === 0) {
      wx.showToast({
        title: '请输入有效的变动金额',
        icon: 'none'
      })
      return
    }

    if (!String(editBalanceReason || '').trim()) {
      wx.showToast({
        title: '请输入调整备注',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      const res = await callAdminApi('updateUserBalance', {
        userId: currentUser._id,
        adjustMode: 'delta',
        delta,
        reason: editBalanceReason
      })

      if (!res.success) {
        throw new Error(res.error || '保存失败')
      }

      wx.hideLoading()
      wx.showToast({
        title: '调整成功',
        icon: 'success'
      })

      this.closeBalanceModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    }
  },

  async saveMiandan() {
    const { currentUser, editMiandanDelta, editMiandanReason } = this.data
    const delta = parseInt(editMiandanDelta, 10)

    if (!Number.isFinite(delta) || delta === 0) {
      wx.showToast({
        title: '请输入有效的变动次数',
        icon: 'none'
      })
      return
    }

    if (!String(editMiandanReason || '').trim()) {
      wx.showToast({
        title: '请输入调整备注',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })

      const res = await callAdminApi('updateUserMiandan', {
        userId: currentUser._id,
        openid: currentUser._openid,
        adjustMode: 'delta',
        delta,
        reason: editMiandanReason
      })

      if (!res.success) {
        throw new Error(res.error || '保存失败')
      }

      wx.hideLoading()
      wx.showToast({
        title: '调整成功',
        icon: 'success'
      })

      this.closeMiandanModal()
      this.loadUsers()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    }
  }
}))
