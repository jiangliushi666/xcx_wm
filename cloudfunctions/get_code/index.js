// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

async function ensureMerchantAuthorized(openid) {
  if (!openid) {
    return false
  }

  const res = await db.collection('admin').where({
    openid
  }).limit(1).get()
  return !!(res.data && res.data[0])
}

// 云函数入口函数
exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()
  const { page, scene } = event

  const authorized = await ensureMerchantAuthorized(OPENID)
  if (!authorized) {
    throw new Error('请先登录商家账号')
  }

  try {
    // 调用生成小程序码的接口
    const result = await cloud.openapi.wxacode.getUnlimited({
      page: page || 'pages/index/index',
      scene: scene || '',
      width: 280
    })

    // 将生成的小程序码上传到云存储中
    const upload = await cloud.uploadFile({
      cloudPath: 'storeCode/' + Date.now() + '-' + Math.random().toString(36).substr(2, 9) + '.png',
      fileContent: result.buffer
    })

    return upload.fileID // 返回文件的fileID,也就是该图片地址
  } catch (err) {
    throw err
  }
}

