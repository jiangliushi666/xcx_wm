// components/avatarNicknameModal/avatarNicknameModal.js
const { saveCurrentUserProfile } = require('../../utils/userProfile')

Component({
  /**
   * 组件的属性列表
   */
  properties: {
    showAvaModal: {
      type: Boolean,
      value: false,
    }
  },

  /**
   * 组件的初始数据
   */
  data: {
    avatarUrl: null,
    nickName: null,
    phoneNumber: null,
    phoneCode: null,
    realPhoneNumber: null, // 真实的手机号（用于提交）
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 阻止页面滑动
     */
    catchtouchmove() { },

    /**
     * 选择头像返回信息监听
     */
    chooseavatar(res) {
      const avatarUrl = res.detail.avatarUrl
      this.setData({
        avatarUrl: avatarUrl
      })
    },

    /** 获取昵称信息 */
    bindblur(res) {
      const value = res.detail.value
      this.data.nickName = value
    },

    /** 获取手机号 */
    async getphonenumber(e) {
      if (e.detail.code) {
        // 获取成功，调用云函数解密
        try {
          wx.showLoading({ title: '获取中...' })
          
          const phoneRes = await wx.cloud.callFunction({
            name: 'getPhoneNumber',
            data: { code: e.detail.code }
          })
          
          wx.hideLoading()
          
          if (phoneRes.result && phoneRes.result.success && phoneRes.result.phoneNumber) {
            const phoneNumber = phoneRes.result.phoneNumber
            // 格式化显示手机号（中间4位用*代替，保护隐私）
           // const displayPhone = phoneNumber.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
            
            this.setData({
              phoneNumber: phoneNumber,
              phoneCode: e.detail.code,
              realPhoneNumber: phoneNumber // 保存真实手机号用于提交
            })
            
            wx.showToast({
              title: '获取成功',
              icon: 'success',
              duration: 1500
            })
          } else {
            const errorMsg = phoneRes.result?.message || '获取手机号失败，请重试'
            throw new Error(errorMsg)
          }
        } catch (err) {
          wx.hideLoading()
          wx.showToast({
            title: err.message || '获取手机号失败',
            icon: 'none'
          })
        }
      } else {
        wx.showToast({
          title: '获取手机号失败',
          icon: 'none'
        })
      }
    },

    /**
     * 保存用户信息
     */
    async saveUserInfo() {
      const {
        avatarUrl,
        nickName,
        phoneNumber,
        realPhoneNumber
      } = this.data

      // 检查必填项
      if (!avatarUrl) {
        wx.showToast({
          title: '请选择头像',
          icon: 'none'
        })
        return
      }
      
      if (!nickName || !nickName.trim()) {
        wx.showToast({
          title: '请输入昵称',
          icon: 'none'
        })
        return
      }

      if (!realPhoneNumber && !phoneNumber) {
        wx.showToast({
          title: '请授权手机号',
          icon: 'none'
        })
        return
      }

      const phone = realPhoneNumber || phoneNumber

      try {
        wx.showLoading({ title: '保存中...' })
        
        const app = getApp()
        const openid = app.globalData.openid

        // 上传头像到云存储
        const cloudPath = `avatar/${openid}_${Date.now()}.png`
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath,
          filePath: avatarUrl
        })

        const profileData = await saveCurrentUserProfile({
          avatarUrl: uploadRes.fileID,
          nickName: nickName.trim(),
          phoneNumber: phone
        })
        const user = profileData.user || {
          avatarUrl: uploadRes.fileID,
          nickName: nickName.trim(),
          phoneNumber: phone
        }

        app.globalData.userInfo = user

        wx.hideLoading()
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        })

        // 通知父组件更新
        this.triggerEvent("saved", {
          avatarUrl: user.avatarUrl,
          nickName: user.nickName,
          phoneNumber: user.phoneNumber,
          user
        })

        // 关闭弹窗
        this.closeModalTap()
      } catch (err) {
        wx.hideLoading()
        wx.showToast({
          title: '保存失败，请重试',
          icon: 'none'
        })
      }
    },

    /**
     * 设置信息按钮点击监听（保留用于兼容）
     */
    setBtnTap() {
      this.saveUserInfo()
    },

    /**
     * 关闭弹窗
     */
    closeModalTap() {
      this.setData({
        showAvaModal: false,
        nickName: null,
        avatarUrl: null,
        phoneNumber: null,
        phoneCode: null,
        realPhoneNumber: null
      })
    },
  }
})
