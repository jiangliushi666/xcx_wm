const { getCurrentUserProfile } = require('./utils/userProfile')

// 常量定义
const LOADING_DELAY_MS = 100 // 防止闪烁的加载延迟

//app.js
App({
  onLaunch: async function () {
    if (!wx.cloud) {
      console.warn('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    this.globalData = {
      openid: '',
      openidReady: false,
      openidPromise: null, // 用于存储获取openid的Promise对象
      userInfo: null, // 用户信息
      userInfoReady: false,
      userInfoPromise: null // 用于存储获取用户信息的Promise对象
    }

    const cloudInitOptions = {
      traceUser: true,
    }

    if (wx.cloud.DYNAMIC_CURRENT_ENV) {
      cloudInitOptions.env = wx.cloud.DYNAMIC_CURRENT_ENV
    }

    wx.cloud.init(cloudInitOptions)
    
    // 启动时立即获取openid
    this.getOpenidPromise();
    
    // 重写Page方法，实现全局拦截
    this.overridePage();
    
    // 检查小程序更新
    this.checkForUpdate();
  },
  
  // 重写Page方法，拦截所有页面的onLoad
  overridePage: function() {
    const originalPage = Page;
    const that = this;
    
    // 替换全局的Page方法
    Page = function(pageConfig) {
      // 保存原来的onLoad方法
      const originalOnLoad = pageConfig.onLoad;
      
      // 重写onLoad方法
      pageConfig.onLoad = async function(options) {
        // 如果openid已准备好，直接调用原onLoad
        if (that.globalData.openidReady) {
          if (originalOnLoad) {
            originalOnLoad.call(this, options);
          }
          return;
        }
        
        // 否则等待openid获取完成
        let loadingShown = false;
        const loadingTimer = setTimeout(() => {
          wx.showLoading({ title: '加载中...' });
          loadingShown = true;
        }, LOADING_DELAY_MS);
        
        try {
          await that.checkOpenid();
          clearTimeout(loadingTimer);
          if (loadingShown) {
            wx.hideLoading();
          }
          
          // 调用原来的onLoad
          if (originalOnLoad) {
            originalOnLoad.call(this, options);
          }
        } catch (error) {
          clearTimeout(loadingTimer);
          if (loadingShown) {
            wx.hideLoading();
          }
          console.error('页面加载失败:', error);
          wx.showToast({
            title: '加载失败，请重试',
            icon: 'none'
          });
        }
      }
      
      // 调用原始的Page构造函数
      return originalPage(pageConfig);
    };
  },
  
  // 将获取openid封装为Promise，方便页面等待openid加载完成
  getOpenidPromise: function() {
    // 如果已经获取过openid，直接返回
    if (this.globalData.openidReady && this.globalData.openid) {
      return Promise.resolve(this.globalData.openid);
    }
    
    // 如果已经有一个正在进行的Promise，直接返回该Promise
    if (this.globalData.openidPromise) {
      return this.globalData.openidPromise;
    }
    
    // 创建新的Promise并保存
    let that = this;
    
    const openidPromise = new Promise(async (resolve, reject) => {
      try {
        let openid = wx.getStorageSync('openid');
        if (!openid) {
          const res = await wx.cloud.callFunction({
            name: 'login'
          });
          openid = res.result.openid;
          that.globalData.openid = res.result.openid;
          wx.setStorageSync('openid', res.result.openid);
        }
        
        that.globalData.openid = openid;
        const profile = await getCurrentUserProfile()
        that.globalData.userInfo = profile.user || null
        
        // 标记openid已准备好
        that.globalData.openidReady = true;
        that.globalData.userInfoReady = true;
        resolve(openid);
      } catch (error) {
        reject(error);
      }
    });

    this.globalData.openidPromise = openidPromise;
    openidPromise.then(
      () => {},
      () => {
        if (!that.globalData.openidReady) {
          that.globalData.openidPromise = null;
        }
      }
    );

    return openidPromise;
  },
  
  // 检查openid是否已获取，供页面使用
  checkOpenid: function() {
    return this.getOpenidPromise();
  },

  // 检查小程序更新
  checkForUpdate: function() {
    // 判断是否支持更新API
    if (wx.canIUse('getUpdateManager')) {
      const updateManager = wx.getUpdateManager()

      // 检查更新
      updateManager.onCheckForUpdate((res) => {
        if (res.hasUpdate) {
          console.log('发现新版本')
        }
      })

      // 更新下载完成
      updateManager.onUpdateReady(() => {
        wx.showModal({
          title: '更新提示',
          content: '新版本已准备好，是否重启应用？',
          showCancel: true,
          confirmText: '立即更新',
          cancelText: '稍后',
          success: (res) => {
            if (res.confirm) {
              // 应用新版本
              updateManager.applyUpdate()
            }
          }
        })
      })

      // 更新失败
      updateManager.onUpdateFailed(() => {
        wx.showModal({
          title: '更新失败',
          content: '新版本下载失败，请删除小程序后重新打开',
          showCancel: false
        })
      })
    }
    // 不支持更新API时静默处理
  }
})