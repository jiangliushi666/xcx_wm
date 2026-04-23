// pages/admin/notice/notice.js
const { withMerchantGuard } = require('../../../utils/merchantGuard')
const { callAdminApi } = require('../../../utils/adminApi')

Page(withMerchantGuard({
  data: {
    notices: [],
    showModal: false,
    editMode: false,
    currentNotice: {
      _id: '',
      content: '',
      status: 1, // 1: 启用, 0: 禁用
      sort: 0
    }
  },

  onLoad() {
    this.loadNotices()
  },

  onShow() {
    this.loadNotices()
  },

  // 加载公告列表
  async loadNotices() {
    try {
      wx.showLoading({ title: '加载中...' })
      
      const res = await callAdminApi('listNotices')

      wx.hideLoading()
      
      this.setData({
        notices: res.success ? (res.data?.list || []) : []
      })
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 显示添加弹窗
  showAddModal() {
    // 检查是否已有公告
    if (this.data.notices.length > 0) {
      wx.showToast({
        title: '只能设置一条公告',
        icon: 'none'
      })
      return
    }
    
    this.setData({
      showModal: true,
      editMode: false,
      currentNotice: {
        _id: '',
        content: '',
        status: 1,
        sort: 0
      }
    })
  },

  // 显示编辑弹窗
  showEditModal(e) {
    const notice = e.currentTarget.dataset.notice
    this.setData({
      showModal: true,
      editMode: true,
      currentNotice: { ...notice }
    })
  },

  // 关闭弹窗
  closeModal() {
    this.setData({
      showModal: false
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入内容
  onContentInput(e) {
    this.setData({
      'currentNotice.content': e.detail.value
    })
  },

  // 输入排序
  onSortInput(e) {
    this.setData({
      'currentNotice.sort': parseInt(e.detail.value) || 0
    })
  },

  // 保存公告
  async saveNotice() {
    const { editMode, currentNotice } = this.data

    if (!currentNotice.content.trim()) {
      wx.showToast({
        title: '请输入公告内容',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '保存中...' })
      const { _id, _openid, ...updateData } = currentNotice
      const saveRes = await callAdminApi('saveNotice', {
        notice: editMode
          ? { ...updateData, _id }
          : updateData
      })

      if (!saveRes.success) {
        throw new Error(saveRes.error || '保存失败')
      }

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })

      this.closeModal()
      this.loadNotices()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  // 切换启用状态
  async toggleStatus(e) {
    const notice = e.currentTarget.dataset.notice
    const newStatus = notice.status === 1 ? 0 : 1

    try {
      const res = await callAdminApi('toggleNoticeStatus', {
        noticeId: notice._id,
        status: newStatus
      })

      if (!res.success) {
        throw new Error(res.error || '操作失败')
      }

      wx.showToast({
        title: newStatus === 1 ? '已启用' : '已禁用',
        icon: 'success'
      })

      this.loadNotices()
    } catch (err) {
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  // 删除公告
  deleteNotice(e) {
    const notice = e.currentTarget.dataset.notice

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条公告吗？',
      success: async (res) => {
        if (res.confirm) {
            try {
              wx.showLoading({ title: '删除中...' })

             const result = await callAdminApi('deleteNotice', {
               noticeId: notice._id
             })

             if (!result.success) {
               throw new Error(result.error || '删除失败')
             }

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadNotices()
          } catch (err) {
            wx.hideLoading()
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  }
}))

