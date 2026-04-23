// pages/index/index.js
const app = getApp()
const {
  getStorefrontHome,
  getStorefrontDishes
} = require('../../utils/storefrontApi')
const {
  getSelectedStore,
  getSelectedStoreId,
  setSelectedStore
} = require('../../utils/storeSelection')
const {
  getCurrentUserProfile,
  saveCurrentUserProfile
} = require('../../utils/userProfile')

Page({
  data: {
    menuList: [], // 菜品分类列表
    currentMenuId: '', // 当前选中的分类ID
    goodsList: [], // 当前分类的菜品列表
    cart: {}, // 购物车 {goodsId: {info: goodsInfo, count: num, tags: {}}}
    cartCount: 0, // 购物车总数量
    cartTotalPrice: 0, // 购物车总价
    cartTotalPriceText: '0.00', // 购物车总价文本（格式化后）
    showCart: false, // 是否显示购物车详情
    userInfo: null, // 用户信息
    noticeList: [], // 公告列表
    noticeText: '', // 公告文本（用于vant组件）
    shopInfo: {}, // 店铺信息
    storeList: [], // 可选门店列表
    selectedStore: null, // 当前选中门店
    selectedStoreId: '', // 当前选中门店ID
    showTagModal: false, // 显示标签选择弹窗
    currentDish: null, // 当前选择的菜品
    selectedTags: {}, // 当前选择的标签 {tagId: [选项]}
    modalDishCount: 1, // 弹窗中选择的商品数量
    modalTotalPrice: 0, // 弹窗中商品小计
    showAuthModal: false, // 显示授权弹窗
    statusBarHeight: 0, // 状态栏高度
    tableNumber: '', // 门店入口标识
    // 菜品分页
    goodsPage: 0,
    goodsPageSize: 20,
    goodsHasMore: true,
    goodsLoading: false
  },

  onLoad(options) {
    this.goodsRequestId = 0
    const selectedStore = getSelectedStore()
    const selectedStoreId = options.storeId || getSelectedStoreId()

    // 获取状态栏高度
    const systemInfo = wx.getSystemInfoSync()
    this.setData({
      statusBarHeight: systemInfo.statusBarHeight || 0,
      selectedStore,
      selectedStoreId
    })
    
    // 检查是否从扫码进入，获取门店入口标识
    // 小程序码扫码进入时，scene参数会在options.scene中
    if (options.scene) {
      // scene参数是经过URL编码的，需要解码
      try {
        const scene = decodeURIComponent(options.scene)
        if (scene) {
          this.setData({
            tableNumber: scene
          })
          wx.showToast({
            title: `已识别入口：${scene}`,
            icon: 'success',
            duration: 2000
          })
        }
      } catch (e) {
        }
    }
    
    this.loadStorefrontHome()
    this.loadUserInfo()
  },

  onShow() {
    const selectedStore = getSelectedStore()
    const selectedStoreId = getSelectedStoreId()
    if (selectedStoreId && selectedStoreId !== this.data.selectedStoreId) {
      this.setData({
        selectedStore,
        selectedStoreId
      })
      this.clearCart()
      this.loadStorefrontHome(false)
    }

    this.loadUserInfo()
  },

  // 加载用户信息
  async loadUserInfo() {
    try {
      const profile = await getCurrentUserProfile()
      const user = profile.user || null

      this.setData({
        userInfo: user
      })

      app.globalData.userInfo = user
    } catch (err) {
      }
  },

  // 加载首页公开数据
  async loadStorefrontHome(showLoading = true) {
    if (showLoading) {
      wx.showLoading({ title: '加载中...' })
    }

    try {
      const requestedStoreId = this.data.selectedStoreId || ''
      const homeData = await getStorefrontHome({
        storeId: requestedStoreId
      })
      const storeList = homeData.stores || []
      const selectedStore = homeData.selectedStore || homeData.shopInfo || null
      const selectedStoreId = (selectedStore && selectedStore._id) || homeData.selectedStoreId || ''

      if (!requestedStoreId && storeList.length > 1) {
        this.setData({
          shopInfo: {},
          storeList,
          selectedStore: null,
          selectedStoreId: '',
          noticeList: [],
          noticeText: '',
          menuList: [],
          currentMenuId: '',
          goodsList: [],
          goodsPage: 0,
          goodsHasMore: false
        })
        this.goToStoreSelect()
        return
      }

      if (selectedStore && selectedStoreId) {
        setSelectedStore(selectedStore)
      }

      const menuList = homeData.categories || []
      const noticeList = homeData.notices || []
      const firstId = menuList.length > 0 ? menuList[0]._id : ''

      this.setData({
        shopInfo: homeData.shopInfo || selectedStore || {},
        storeList,
        selectedStore,
        selectedStoreId,
        noticeList,
        noticeText: noticeList.map(item => item.content).join('    '),
        menuList,
        currentMenuId: firstId,
        goodsList: [],
        goodsPage: 0,
        goodsHasMore: !!firstId
      })

      if (firstId) {
        await this.loadGoods(firstId, false, false)
      } else if (showLoading) {
        wx.showToast({ title: '暂无菜品分类', icon: 'none' })
      }
    } catch (err) {
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      if (showLoading) {
        wx.hideLoading()
      }
    }
  },

  // 加载指定分类的菜品
  async loadGoods(menuId, append = false, showLoading = true) {
    if (!menuId) return
    if (append && this.data.goodsLoading) return

    const requestId = (this.goodsRequestId || 0) + 1
    this.goodsRequestId = requestId

    if (!append && showLoading) {
      wx.showLoading({ title: '加载中...' })
    }

    this.setData({ goodsLoading: true })

    try {
      const pageSize = this.data.goodsPageSize
      const page = append ? this.data.goodsPage + 1 : 0
      const goodsData = await getStorefrontDishes({
        storeId: this.data.selectedStoreId,
        categoryId: menuId,
        page,
        pageSize
      })
      if (requestId !== this.goodsRequestId || this.data.currentMenuId !== menuId) {
        return
      }
      const list = goodsData.list || []
      const mapped = list.map(goods => ({
        ...goods,
        cartCount: this.getDishCartCount(goods._id)
      }))

      this.setData({
        goodsList: append ? this.data.goodsList.concat(mapped) : mapped,
        goodsPage: page,
        goodsHasMore: !!goodsData.hasMore
      })
    } catch (err) {
      if (showLoading) {
        wx.showToast({ title: '加载失败', icon: 'none' })
      }
    } finally {
      if (requestId === this.goodsRequestId) {
        if (!append && showLoading) {
          wx.hideLoading()
        }
        this.setData({
          goodsLoading: false
        })
      }
    }
  },

  // 切换菜品分类
  switchMenu(e) {
    const menuId = e.currentTarget.dataset.id
    this.setData({
      currentMenuId: menuId,
      goodsPage: 0,
      goodsHasMore: true,
      goodsList: []
    })
    this.loadGoods(menuId)
  },

  // 添加到购物车 - 显示标签选择弹窗
  addToCart(e) {
    const goods = e.currentTarget.dataset.goods
    
    // 初始化标签选择状态，多选标签初始化为数组
    const selectedTags = {}
    if (goods.tags && goods.tags.length > 0) {
      goods.tags.forEach(tag => {
        if (tag.type === 'multiple') {
          selectedTags[tag.id] = []
        }
      })
    }
    
    // 总是显示弹窗，让用户选择数量
    this.setData({
      showTagModal: true,
      currentDish: goods,
      selectedTags: selectedTags,
      modalDishCount: 1,
      modalTotalPrice: (goods.price * 1).toFixed(2)
    })
  },

  // 确认添加到购物车
  confirmAddToCart() {
    const { currentDish, selectedTags, modalDishCount } = this.data
    const cart = this.data.cart
    
    // 验证必选标签
    if (currentDish.tags && currentDish.tags.length > 0) {
      for (let tag of currentDish.tags) {
        if (tag.required) {
          const selectedValue = selectedTags[tag.id]
          if (!selectedValue || 
              (Array.isArray(selectedValue) && selectedValue.length === 0)) {
            wx.showToast({
              title: `请选择${tag.name}`,
              icon: 'none'
            })
            return
          }
        }
      }
    }
    
    // 生成唯一的购物车ID（包含标签信息）
    const cartKey = this.generateCartKey(currentDish._id, selectedTags)
    
    // 转换标签为可显示的数组
    const tagLabels = []
    if (currentDish.tags && currentDish.tags.length > 0) {
      for (let tagId in selectedTags) {
        const tag = currentDish.tags.find(t => t.id === tagId)
        if (tag) {
          const value = selectedTags[tagId]
          if (Array.isArray(value)) {
            tagLabels.push(...value)
          } else {
            tagLabels.push(value)
          }
        }
      }
    }
    
    if (cart[cartKey]) {
      cart[cartKey].count += modalDishCount
    } else {
      cart[cartKey] = {
        info: currentDish,
        count: modalDishCount,
        tags: { ...selectedTags },
        tagLabels: tagLabels, // 用于显示的标签数组
        dishId: currentDish._id // 保存原始菜品ID
      }
    }
    
    this.updateCart(cart)
    this.closeTagModal()
  },

  // 生成购物车Key（包含标签信息）
  generateCartKey(dishId, tags) {
    if (!tags || Object.keys(tags).length === 0) {
      return dishId
    }
    
    const tagStr = Object.keys(tags).sort().map(key => {
      const val = tags[key]
      return `${key}:${Array.isArray(val) ? val.sort().join(',') : val}`
    }).join('|')
    
    return `${dishId}_${tagStr}`
  },

  // 获取菜品在购物车中的数量（包括所有标签组合）
  getDishCartCount(dishId, cart) {
    // 如果传入了 cart 参数，使用传入的 cart，否则使用 this.data.cart
    const cartData = cart !== undefined ? cart : this.data.cart
    let totalCount = 0
    
    // 遍历购物车，找到所有该菜品的数量（包括不同标签组合）
    for (let cartKey in cartData) {
      if (cartData[cartKey] && cartData[cartKey].dishId === dishId) {
        totalCount += cartData[cartKey].count || 0
      }
    }
    
    return totalCount
  },

  // 从菜品列表直接添加到购物车（无标签版本）
  addDishToCartDirect(e) {
    const goods = e.currentTarget.dataset.goods
    
    // 如果菜品没有标签，直接添加（使用菜品ID作为key）
    if (!goods.tags || goods.tags.length === 0) {
      const cart = { ...this.data.cart }
      const cartKey = goods._id
      
      if (cart[cartKey]) {
        // 已存在，增加数量
        cart[cartKey].count++
      } else {
        // 不存在，创建新项
        cart[cartKey] = {
          info: goods,
          count: 1,
          tags: {},
          tagLabels: [],
          dishId: goods._id
        }
      }
      
      this.updateCart(cart)
      wx.showToast({
        title: '已添加',
        icon: 'success',
        duration: 1000
      })
    } else {
      // 有标签，显示弹窗让用户选择
      this.addToCart(e)
    }
  },

  // 从菜品列表减少数量（无标签版本）
  reduceDishFromCart(e) {
    const goods = e.currentTarget.dataset.goods
    const cart = { ...this.data.cart }
    const cartKey = goods._id
    
    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) {
        delete cart[cartKey]
      }
      this.updateCart(cart)
    } else {
      // 如果直接key不存在，可能是带标签的，需要查找所有该菜品的项
      // 找到第一个并减少（优先减少无标签的）
      for (let key in cart) {
        if (cart[key] && cart[key].dishId === goods._id) {
          cart[key].count--
          if (cart[key].count <= 0) {
            delete cart[key]
          }
          this.updateCart(cart)
          break
        }
      }
    }
  },

  // 从购物车减少
  reduceFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }
    
    if (cart[cartKey]) {
      cart[cartKey].count--
      if (cart[cartKey].count <= 0) {
        delete cart[cartKey]
      }
    }
    
    this.updateCart(cart)
  },

  // 从购物车增加
  addToCartFromCart(e) {
    const cartKey = e.currentTarget.dataset.id
    const cart = { ...this.data.cart }
    
    if (cart[cartKey]) {
      cart[cartKey].count++
    }
    
    this.updateCart(cart)
  },

  // 选择标签选项（单选）
  selectTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    const selectedTags = { ...this.data.selectedTags }
    selectedTags[tagId] = option
    
    this.setData({
      selectedTags: selectedTags
    })
  },

  // 切换标签选项（多选）
  toggleTagOption(e) {
    const { tagId, option } = e.currentTarget.dataset
    
    if (!tagId || !option) {
      return
    }
    
    // 深拷贝，确保不修改原数据
    const selectedTags = JSON.parse(JSON.stringify(this.data.selectedTags || {}))
    
    // 确保 tagId 对应的值是数组
    if (!selectedTags[tagId]) {
      selectedTags[tagId] = []
    } else if (!Array.isArray(selectedTags[tagId])) {
      // 如果是字符串或其他类型，转为数组
      selectedTags[tagId] = [selectedTags[tagId]]
    }
    
    // 创建新数组，避免直接修改
    const tagArray = [...selectedTags[tagId]]
    const index = tagArray.indexOf(option)
    
    if (index > -1) {
      // 已选中，移除
      tagArray.splice(index, 1)
    } else {
      // 未选中，添加
      tagArray.push(option)
    }
    
    selectedTags[tagId] = tagArray
    
    // 强制更新
    this.setData({
      selectedTags: selectedTags
    }, () => {
      })
  },

  // 关闭标签弹窗
  closeTagModal() {
    this.setData({
      showTagModal: false,
      currentDish: null,
      selectedTags: {},
      modalDishCount: 1,
      modalTotalPrice: 0
    })
  },

  // 增加弹窗商品数量
  increaseModalCount() {
    const newCount = this.data.modalDishCount + 1
    const price = this.data.currentDish ? this.data.currentDish.price : 0
    this.setData({
      modalDishCount: newCount,
      modalTotalPrice: (price * newCount).toFixed(2)
    })
  },

  // 减少弹窗商品数量
  decreaseModalCount() {
    if (this.data.modalDishCount > 1) {
      const newCount = this.data.modalDishCount - 1
      const price = this.data.currentDish ? this.data.currentDish.price : 0
      this.setData({
        modalDishCount: newCount,
        modalTotalPrice: (price * newCount).toFixed(2)
      })
    }
  },

  // 阻止冒泡
  stopPropagation() {},

  // 用户信息保存回调（来自 avatarNicknameModal）
  async onUserInfoSaved(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail || {}

    // 先在本地更新，避免再次点击时仍判断为未完善
    this.setData({
      userInfo: {
        ...(this.data.userInfo || {}),
        avatarUrl,
        nickName,
        phoneNumber
      },
      showAuthModal: false
    })

    // 再从数据库刷新一次，保证余额等字段最新
    try {
      await this.loadUserInfo()
    } catch (err) {
      }

    // 信息完善后重新尝试结算
    this.goToSettle()
  },

  // 处理用户授权
  async handleUserAuth(e) {
    const { avatarUrl, nickName, phoneNumber } = e.detail
    
    if (!phoneNumber) {
      wx.showToast({
        title: '请先获取手机号',
        icon: 'none'
      })
      return
    }
    
    try {
      wx.showLoading({ title: '授权中...' })
          
      const openid = app.globalData.openid
      
      // 上传头像到云存储
      const cloudPath = `avatar/${openid}_${Date.now()}.png`
      const uploadRes = await wx.cloud.uploadFile({
        cloudPath,
        filePath: avatarUrl
      })
      
      const profileData = await saveCurrentUserProfile({
        avatarUrl: uploadRes.fileID,
        nickName,
        phoneNumber
      })

      const user = profileData.user || {
        avatarUrl: uploadRes.fileID,
        nickName,
        phoneNumber
      }
      
      // 重新加载用户信息，确保获取完整的数据
      this.setData({
        userInfo: user
      })
      app.globalData.userInfo = user
      await this.loadUserInfo()
      
      this.setData({
        showAuthModal: false
      })
      
      wx.hideLoading()
      wx.showToast({
        title: '授权成功',
        icon: 'success'
      })
      
      // 授权成功后，再次尝试下单
      setTimeout(() => {
        this.goToSettle()
      }, 500)
      
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: '授权失败，请重试',
        icon: 'none'
      })
    }
  },

  // 更新购物车
  updateCart(cart) {
    let totalCount = 0
    let totalPrice = 0
    
    for (let cartKey in cart) {
      if (cart[cartKey] && cart[cartKey].info && cart[cartKey].count) {
        totalCount += cart[cartKey].count
        totalPrice += cart[cartKey].info.price * cart[cartKey].count
      }
    }
    
    // 更新菜品列表中的购物车数量（传入新的 cart 参数，确保使用最新的购物车数据）
    const goodsList = this.data.goodsList.map(goods => {
      goods.cartCount = this.getDishCartCount(goods._id, cart)
      return goods
    })
    
    this.setData({
      cart: cart,
      cartCount: totalCount,
      cartTotalPrice: totalPrice,
      cartTotalPriceText: totalPrice.toFixed(2),
      goodsList: goodsList, // 更新菜品列表，包含购物车数量
      showCart: totalCount > 0 ? this.data.showCart : false // 购物车为空时自动关闭
    })
  },

  // 显示/隐藏购物车详情
  toggleCart() {
    if (this.data.cartCount === 0) return
    this.setData({
      showCart: !this.data.showCart
    })
  },

  // 清空购物车
  clearCart() {
    // 更新菜品列表中的购物车数量
    const goodsList = this.data.goodsList.map(goods => {
      goods.cartCount = 0
      return goods
    })
    
    this.setData({
      cart: {},
      cartCount: 0,
      cartTotalPrice: 0,
      cartTotalPriceText: '0.00',
      goodsList: goodsList,
      showCart: false
    })
  },

  // 去结算
  goToSettle() {
    if (this.data.cartCount === 0) {
      wx.showToast({ title: '购物车为空', icon: 'none' })
      return
    }
    if (!this.data.selectedStoreId) {
      wx.showToast({ title: '请先选择门店', icon: 'none' })
      this.goToStoreSelect()
      return
    }
    this.navigateToSettle()
  },

  // 跳转到结算页面
  navigateToSettle() {
    // 将购物车数据存储到本地，供结算页面使用
    try {
      wx.setStorageSync('settleCartData', {
        cart: this.data.cart,
        totalPrice: this.data.cartTotalPrice,
        storeId: this.data.selectedStoreId,
        selectedStore: this.data.selectedStore
      })
      
      // 跳转到结算页面
      wx.navigateTo({
        url: '/pages/settle/settle'
      })
    } catch (err) {
      wx.showToast({
        title: '跳转失败',
        icon: 'none'
      })
    }
  },

  goToStoreSelect() {
    wx.navigateTo({
      url: `/pages/store/select/select?storeId=${this.data.selectedStoreId || ''}`
    })
  },

  // 扫码识别门店入口
  scanTableCode() {
    wx.showLoading({
      title: '识别中...',
      mask: true
    })
    wx.scanCode({
      onlyFromCamera: false, // 允许从相册选择
      scanType: ['qrCode', 'barCode', 'wxCode'],
      success: (res) => {
        wx.hideLoading()
        let tableNumber = ''
        
        // 从 path 的 scene 参数中提取入口标识
        if (res.path) {
          const queryStr = res.path.split('?')[1]
          if (queryStr) {
            const params = queryStr.split('&')
            for (let param of params) {
              const [key, value] = param.split('=')
              if (key === 'scene' && value) {
                tableNumber = decodeURIComponent(value).trim()
                break
              }
            }
          }
        }
        
        if (tableNumber) {
          this.setData({
            tableNumber: tableNumber
          })
          wx.showToast({
            title: `入口：${tableNumber}`,
            icon: 'success'
          })
          // 扫码成功后，跳转到结算页面
          setTimeout(() => {
            this.navigateToSettle()
          }, 1000)
        } else {
          wx.showToast({
            title: '未能识别入口',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        if (err.errMsg && !err.errMsg.includes('cancel')) {
          wx.showToast({
            title: '扫码失败',
            icon: 'none'
          })
        }
      }
    })
  },

  // 页面触底加载更多菜品
  onReachBottom() {
    if (this.data.goodsHasMore && !this.data.goodsLoading && this.data.currentMenuId) {
      this.loadGoods(this.data.currentMenuId, true)
    }
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: this.data.shopInfo.name || '外卖点单',
      path: '/pages/index/index',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: this.data.shopInfo.name || '外卖点单',
      query: '',
      imageUrl: '' // 可以设置分享图片，留空则使用小程序默认图片
    }
  },

  // 下拉刷新
  async onPullDownRefresh() {
    try {
      // 重置分页状态
      this.setData({
        goodsPage: 0,
        goodsHasMore: true,
        goodsLoading: false
      })

      // 并行刷新所有数据（不显示 loading，使用系统下拉刷新动画）
      await Promise.all([
        this.loadStorefrontHome(false),
        this.loadUserInfo()
      ])
    } catch (err) {
      } finally {
      // 停止下拉刷新动画
      wx.stopPullDownRefresh()
    }
  }
})
