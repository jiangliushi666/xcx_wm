const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

function buildFullAddress(region, detail) {
  const regionParts = Array.isArray(region) ? region : []
  const detailText = (detail || '').trim()
  return [...regionParts.filter(Boolean), detailText].filter(Boolean).join('')
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const {
    addressId = '',
    name = '',
    mobile = '',
    region = [],
    detail = '',
    isDefault = false,
    label = '',
    lat = '',
    lng = ''
  } = event || {}

  const trimmedName = String(name || '').trim()
  const trimmedMobile = String(mobile || '').trim()
  const trimmedDetail = String(detail || '').trim()
  const shouldBeDefault = !!isDefault

  if (!trimmedName) {
    return { success: false, error: '请输入收货人姓名' }
  }

  if (!/^1\d{10}$/.test(trimmedMobile)) {
    return { success: false, error: '请输入正确的手机号' }
  }

  if (!Array.isArray(region) || region.length < 3) {
    return { success: false, error: '请选择完整地区' }
  }

  if (!trimmedDetail) {
    return { success: false, error: '请输入详细地址' }
  }

  const [province, city, district] = region
  const fullAddress = buildFullAddress(region, trimmedDetail)

  try {
    const result = await db.runTransaction(async transaction => {
      const isEdit = !!addressId
      if (isEdit) {
        let targetAddress = null

        try {
          const targetRes = await transaction.collection('address').doc(addressId).get()
          targetAddress = targetRes.data
        } catch (error) {
          throw new Error('地址不存在或无权修改')
        }

        if (!targetAddress || targetAddress._openid !== OPENID) {
          throw new Error('地址不存在或无权修改')
        }
      }

      const existingRes = await transaction.collection('address').where({
        _openid: OPENID
      }).get()

      const saveData = {
        name: trimmedName,
        mobile: trimmedMobile,
        province,
        city,
        district,
        detail: trimmedDetail,
        fullAddress,
        label: String(label || '').trim(),
        lat,
        lng,
        updateTime: db.serverDate()
      }

      let savedId = addressId
      let savedDoc = null

      if (isEdit) {
        await transaction.collection('address').doc(addressId).update({
          data: saveData
        })

        const latestRes = await transaction.collection('address').doc(addressId).get()
        savedDoc = latestRes.data
      } else {
        const addRes = await transaction.collection('address').add({
          data: {
            _openid: OPENID,
            ...saveData,
            createTime: db.serverDate()
          }
        })
        savedId = addRes._id
        const latestRes = await transaction.collection('address').doc(savedId).get()
        savedDoc = latestRes.data
      }

      const addressCount = existingRes.data ? existingRes.data.length : 0
      const needDefault = shouldBeDefault || addressCount <= 1

      if (needDefault) {
        await transaction.collection('address').where({
          _openid: OPENID,
          _id: _.neq(savedId)
        }).update({
          data: {
            isDefault: false,
            updateTime: db.serverDate()
          }
        })

        await transaction.collection('address').doc(savedId).update({
          data: {
            isDefault: true
          }
        })
      } else {
        const defaultCount = await transaction.collection('address').where({
          _openid: OPENID,
          isDefault: true
        }).count()

        if (defaultCount.total === 0) {
          await transaction.collection('address').doc(savedId).update({
            data: {
              isDefault: true
            }
          })
        }
      }

      return {
        success: true,
        addressId: savedId,
        data: {
          ...savedDoc,
          _id: savedId,
          _openid: OPENID,
          isDefault: needDefault || (savedDoc && savedDoc.isDefault)
        }
      }
    })

    return result
  } catch (err) {
    return {
      success: false,
      error: err.message || '保存地址失败'
    }
  }
}
