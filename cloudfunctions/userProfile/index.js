const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function roundMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) {
    return 0
  }
  return Number(amount.toFixed(2))
}

function sanitizeUser(user = {}) {
  return {
    _id: user._id || '',
    avatarUrl: user.avatarUrl || '',
    nickName: user.nickName || '',
    phoneNumber: user.phoneNumber || '',
    balance: roundMoney(user.balance),
    createTime: user.createTime || null,
    updateTime: user.updateTime || null
  }
}

async function getUserByOpenid(openid) {
  const res = await db.collection('user').where({
    _openid: openid
  }).limit(1).get()

  return (res.data && res.data[0]) || null
}

async function ensureUserRecord(openid) {
  let user = await getUserByOpenid(openid)

  if (!user) {
    const addRes = await db.collection('user').add({
      data: {
        _openid: openid,
        balance: 0,
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    const freshRes = await db.collection('user').doc(addRes._id).get()
    return freshRes.data || null
  }

  if (!Number.isFinite(Number(user.balance))) {
    await db.collection('user').doc(user._id).update({
      data: {
        balance: 0,
        updateTime: db.serverDate()
      }
    })

    const freshRes = await db.collection('user').doc(user._id).get()
    user = freshRes.data || {
      ...user,
      balance: 0
    }
  }

  return user
}

async function getMiandanCount(openid) {
  const res = await db.collection('freeBuy').where({
    _openid: openid
  }).limit(1).get()

  const record = res.data && res.data[0]
  return Number(record && record.count) || 0
}

async function getCurrentUserProfile(openid, event = {}) {
  const user = await ensureUserRecord(openid)
  const data = {
    user: sanitizeUser(user || {})
  }

  if (event.includeMiandan) {
    data.miandanCount = await getMiandanCount(openid)
  }

  return {
    success: true,
    data
  }
}

async function saveCurrentUserProfile(openid, event = {}) {
  const avatarUrl = normalizeText(event.avatarUrl)
  const nickName = normalizeText(event.nickName)
  const phoneNumber = normalizeText(event.phoneNumber)

  if (!avatarUrl) {
    throw new Error('头像不能为空')
  }

  if (!nickName) {
    throw new Error('昵称不能为空')
  }

  if (!phoneNumber) {
    throw new Error('手机号不能为空')
  }

  const user = await ensureUserRecord(openid)
  if (!user || !user._id) {
    throw new Error('用户不存在')
  }

  await db.collection('user').doc(user._id).update({
    data: {
      avatarUrl,
      nickName,
      phoneNumber,
      updateTime: db.serverDate()
    }
  })

  const freshRes = await db.collection('user').doc(user._id).get()
  return {
    success: true,
    data: {
      user: sanitizeUser(freshRes.data || {})
    }
  }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  const action = normalizeText(event.action) || 'get'

  try {
    if (action === 'get') {
      return await getCurrentUserProfile(OPENID, event)
    }

    if (action === 'save') {
      return await saveCurrentUserProfile(OPENID, event)
    }

    return {
      success: false,
      error: '未知操作'
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '操作失败'
    }
  }
}
