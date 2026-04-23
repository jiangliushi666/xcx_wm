// pages/admin/tableCode/tableCode.js
const { withMerchantGuard } = require('../../../utils/merchantGuard')
const { callAdminApi } = require('../../../utils/adminApi')

Page(withMerchantGuard({
  data: {
    tableCodeList: [],
    showAddModal: false,
    newTableNumber: '',
    posterBgUrl: '',
    // painter相关
    paintPallette: null,
    template: '',
    action: '',
    customActionStyle: ''
  },

  onLoad() {
    this.loadTableCodeList()
    this.loadPosterBgUrl()
  },

  onShow() {
    this.loadTableCodeList()
    this.loadPosterBgUrl()
  },

  // 加载入口码列表
  async loadTableCodeList() {
    try {
      wx.showLoading({ title: '加载中...' })

      const res = await callAdminApi('listTableCodes')
      if (!res.success) {
        throw new Error(res.error || '加载入口码列表失败')
      }

      // 格式化时间
      const formatTime = (time) => {
        if (!time) return ''
        const date = time instanceof Date ? time : new Date(time)
        const pad = (n) => (n < 10 ? '0' + n : n)
        const y = date.getFullYear()
        const m = pad(date.getMonth() + 1)
        const d = pad(date.getDate())
        const hh = pad(date.getHours())
        const mm = pad(date.getMinutes())
        return `${y}-${m}-${d} ${hh}:${mm}`
      }

      const list = ((res.data && res.data.list) || []).map(item => ({
        ...item,
        createTimeText: item.createTime ? formatTime(item.createTime) : ''
      }))

      this.setData({
        tableCodeList: list
      })
    } catch (err) {
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
  },

  async loadPosterBgUrl() {
    try {
      const res = await callAdminApi('getShopInfo')
      const posterBgUrl = res.success && res.data && res.data.shopInfo
        ? (res.data.shopInfo.posterBgUrl || '')
        : ''

      this.setData({
        posterBgUrl
      })
    } catch (err) {
      }
  },

  // 显示新建弹窗
  showAddModal() {
    this.setData({
      showAddModal: true,
      newTableNumber: ''
    })
  },

  // 关闭新建弹窗
  closeAddModal() {
    this.setData({
      showAddModal: false,
      newTableNumber: ''
    })
  },

  // 阻止冒泡
  stopPropagation() {},

  // 输入入口码
  onTableNumberInput(e) {
    this.setData({
      newTableNumber: e.detail.value
    })
  },

  // 确认新建入口码
  async confirmAddTableCode() {
    const tableNumber = this.data.newTableNumber.trim()

    if (!tableNumber) {
      wx.showToast({
        title: '请输入入口码',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '检查中...' })

      // 生成小程序码
      wx.showLoading({ title: '生成小程序码中...' })

      const codeRes = await wx.cloud.callFunction({
        name: 'get_code',
        data: {
          scene: `${tableNumber}`,
          page: 'pages/index/index'
        }
      })

      if (!codeRes.result) {
        wx.hideLoading()
        wx.showToast({
          title: '生成小程序码失败',
          icon: 'none'
        })
        return
      }

      const qrCodeUrl = codeRes.result

      const addRes = await callAdminApi('createTableCode', {
        tableNumber,
        qrCodeUrl
      })

      if (!addRes.success) {
        throw new Error(addRes.error || '创建入口码失败')
      }

      // 生成海报
      this.currentTableCodeId = addRes.data?._id || ''
      this.currentTableNumber = tableNumber
      try {
        wx.showLoading({ title: '生成海报中...' })
        await this.generatePoster(qrCodeUrl, tableNumber)
        wx.hideLoading()
        wx.showToast({
          title: '创建成功',
          icon: 'success'
        })
      } catch (posterErr) {
        wx.hideLoading()
        wx.showToast({
          title: posterErr.message || '海报生成失败',
          icon: 'none'
        })
      }

      this.closeAddModal()
      this.loadTableCodeList()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '创建失败',
        icon: 'none'
      })
    }
  },

  async resolvePosterBgUrl() {
    const posterBgUrl = String(this.data.posterBgUrl || '').trim()

    if (!posterBgUrl) {
      throw new Error('请先在商家中心的店铺设置中配置入口码海报背景图')
    }

    if (!posterBgUrl.startsWith('cloud://')) {
      return posterBgUrl
    }

    const tempRes = await wx.cloud.getTempFileURL({
      fileList: [posterBgUrl]
    })

    const tempUrl = tempRes.fileList && tempRes.fileList[0] && tempRes.fileList[0].tempFileURL
    if (!tempUrl) {
      throw new Error('海报背景图无法访问，请检查店铺设置')
    }

    return tempUrl
  },

  // 生成海报
  async generatePoster(qrCodeUrl, tableNumber) {
    const bgImg = await this.resolvePosterBgUrl()

    return new Promise((resolve, reject) => {

      // 绘制海报的JSON数据
      const viewList = {
        "width": "450px",
        "height": "798px",
        "background": "#f8f8f8",
        "views": [
          {
            "type": "image",
            "url": bgImg,
            "css": {
              "width": "450px",
              "height": "798px",
              "top": "0px",
              "left": "0px",
              "rotate": "0",
              "borderRadius": "",
              "borderWidth": "",
              "borderColor": "#000000",
              "shadow": "",
              "mode": "scaleToFill"
            }
          },
          {
            "type": "image",
            "url": qrCodeUrl,
            "css": {
              "width": "240px",
              "height": "240px",
              "top": "260px",
              "left": "90px",
              "rotate": "0",
              "borderRadius": "10px",
              "borderWidth": "",
              "borderColor": "#000000",
              "shadow": "",
              "mode": "scaleToFill"
            }
          },
          {
            "type": "text",
            "text": `入口码：${tableNumber}`,
            "css": [
              {
                top: '520px',
                width: "635rpx",
                height: '50px',
                fontSize: '48px',
                maxLines: '2',
                left: '80px',
                lineHeight: '30px',
                color: '#333',
                fontWeight: 'bold'
              }
            ]
          },

        //   {
        //     "type": "text",
        //     "text": "长按保存或扫码点餐",
        //     "css": [
        //       {
        //         top: '680px',
        //         width: "635rpx",
        //         height: '50px',
        //         fontSize: '20px',
        //         maxLines: '2',
        //         left: '140px',
        //         lineHeight: '30px',
        //         color: '#666'
        //       }
        //     ]
        //   }
        ]
      }

      // 保存当前入口码，用于onImgOK中更新数据库
      this.currentTableNumber = tableNumber
      this.posterResolve = resolve
      this.posterReject = reject

      this.setData({
        paintPallette: this.palette(viewList),
        action: 'canvasToTempFilePath'
      })
    })
  },

  // 处理特定格式函数
  palette(viewList) {
    return viewList
  },

  // 绘制完成后的回调函数
  async onImgOK(res) {
    try {
      const path = res.detail.path
      // 上传图片到云存储
      const cloudPath = `tableCode/poster/${Date.now()}-${Math.floor(Math.random() * 1000)}.png`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: path
      })

      // 更新数据库中的海报URL
      if (this.currentTableCodeId) {
        const updateRes = await callAdminApi('updateTablePoster', {
          tableCodeId: this.currentTableCodeId,
          posterUrl: uploadRes.fileID
        })

        if (!updateRes.success) {
          throw new Error(updateRes.error || '更新海报失败')
        }
        this.currentTableCodeId = null
      }

      if (this.posterResolve) {
        this.posterResolve()
        this.posterResolve = null
      }
      this.posterReject = null

      wx.hideLoading()
    } catch (err) {
      if (this.posterReject) {
        this.posterReject(err)
        this.posterReject = null
      }
      this.posterResolve = null
      wx.hideLoading()
    }
  },

  touchEnd() {},

  // 预览海报
  async previewPoster(e) {
    const item = e.currentTarget.dataset.item

    if (!item.posterUrl) {
      wx.showToast({
        title: '海报未生成',
        icon: 'none'
      })
      return
    }

    // 将云存储文件ID转换为https URL
    const fileList = [item.posterUrl]
    wx.previewImage({
      urls: fileList,
      current: fileList[0]
    })
  },

  // 下载海报
  async downloadPoster(e) {
    const item = e.currentTarget.dataset.item

    if (!item.posterUrl) {
      wx.showToast({
        title: '海报未生成',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '下载中...' })

      // 检查授权状态
      const authRes = await wx.getSetting()
      if (!authRes.authSetting['scope.writePhotosAlbum']) {
        // 未授权，请求授权
        await wx.authorize({
          scope: 'scope.writePhotosAlbum'
        })
      }

      let imageUrl = item.posterUrl

        // 如果是云存储fileID（cloud://开头），需要转换为临时URL
      if (imageUrl.startsWith('cloud://')) {
        const tempFileRes = await wx.cloud.getTempFileURL({
          fileList: [imageUrl]
        })
        if (tempFileRes.fileList && tempFileRes.fileList.length > 0) {
          imageUrl = tempFileRes.fileList[0].tempFileURL
        } else {
          throw new Error('获取文件URL失败')
        }
      }

      // 下载图片到本地（使用回调方式，因为不支持Promise）
      const downloadRes = await new Promise((resolve, reject) => {
        wx.downloadFile({
          url: imageUrl,
          success: (res) => {
            if (res.statusCode === 200 && res.tempFilePath) {
              resolve(res)
            } else {
              reject(new Error('下载失败'))
            }
          },
          fail: (err) => {
            reject(err)
          }
        })
      })

      // 保存到相册
      await wx.saveImageToPhotosAlbum({
        filePath: downloadRes.tempFilePath
      })

      wx.hideLoading()
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
    } catch (err) {
      wx.hideLoading()
      
      // 用户拒绝授权
      if (err.errMsg && (err.errMsg.includes('auth deny') || err.errMsg.includes('authorize'))) {
        wx.showModal({
          title: '提示',
          content: '需要您授权保存图片到相册',
          showCancel: false
        })
      } else {
        wx.showToast({
          title: err.errMsg || '下载失败',
          icon: 'none'
        })
      }
    }
  },

  async regeneratePoster(e) {
    const item = e.currentTarget.dataset.item

    if (!item || !item._id || !item.qrCodeUrl || !item.tableNumber) {
      wx.showToast({
        title: '入口码数据不完整',
        icon: 'none'
      })
      return
    }

    try {
      wx.showLoading({ title: '重新生成中...' })
      this.currentTableCodeId = item._id
      this.currentTableNumber = item.tableNumber
      await this.generatePoster(item.qrCodeUrl, item.tableNumber)
      wx.hideLoading()
      wx.showToast({
        title: '海报已更新',
        icon: 'success'
      })
      this.loadTableCodeList()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '重新生成失败',
        icon: 'none'
      })
    }
  },

  // 删除入口码
  deleteTableCode(e) {
    const id = e.currentTarget.dataset.id

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个入口码吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中...' })

             const result = await callAdminApi('deleteTableCode', {
               tableCodeId: id
             })

             if (!result.success) {
               throw new Error(result.error || '删除失败')
             }

            wx.hideLoading()
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            })

            this.loadTableCodeList()
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

