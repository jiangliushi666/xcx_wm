const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const { addressId = '' } = event || {}

  if (!addressId) {
    return {
      success: false,
      error: '地址ID不能为空'
    }
  }

  try {
    const result = await db.runTransaction(async transaction => {
      const addressRes = await transaction.collection('address').doc(addressId).get()
      const address = addressRes.data

      if (!address || address._openid !== OPENID) {
        throw new Error('地址不存在')
      }

      const wasDefault = !!address.isDefault

      await transaction.collection('address').doc(addressId).remove()

      if (wasDefault) {
        const remainRes = await transaction.collection('address').where({
          _openid: OPENID
        }).orderBy('createTime', 'asc').limit(1).get()

        if (remainRes.data && remainRes.data.length > 0) {
          await transaction.collection('address').doc(remainRes.data[0]._id).update({
            data: {
              isDefault: true,
              updateTime: db.serverDate()
            }
          })
        }
      }

      return {
        success: true
      }
    })

    return result
  } catch (err) {
    return {
      success: false,
      error: err.message || '删除地址失败'
    }
  }
}
