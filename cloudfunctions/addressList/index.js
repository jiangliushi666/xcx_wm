const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()

  try {
    const res = await db.collection('address')
      .where({
        _openid: OPENID
      })
      .orderBy('isDefault', 'desc')
      .orderBy('updateTime', 'desc')
      .get()

    return {
      success: true,
      data: res.data || []
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '加载地址列表失败'
    }
  }
}
