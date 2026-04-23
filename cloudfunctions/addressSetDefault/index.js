const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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

      await transaction.collection('address').where({
        _openid: OPENID,
        _id: _.neq(addressId)
      }).update({
        data: {
          isDefault: false,
          updateTime: db.serverDate()
        }
      })

      await transaction.collection('address').doc(addressId).update({
        data: {
          isDefault: true,
          updateTime: db.serverDate()
        }
      })

      return {
        success: true
      }
    })

    return result
  } catch (err) {
    return {
      success: false,
      error: err.message || '设置默认地址失败'
    }
  }
}
