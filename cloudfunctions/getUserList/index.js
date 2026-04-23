const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const USER_ADJUST_LOG_COLLECTION = 'userAdjustLog'

async function ensureMerchantAuthorized(openid) {
  if (!openid) {
    return false
  }

  const res = await db.collection('admin').where({
    openid
  }).limit(1).get()
  return !!(res.data && res.data[0])
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toSafeInt(value, fallback = 0) {
  const parsed = parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function roundMoney(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) {
    return 0
  }
  return Number(amount.toFixed(2))
}

function formatDate(value) {
  if (!value) {
    return ''
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (num) => (num < 10 ? `0${num}` : `${num}`)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function buildAdjustSummary(log = {}) {
  const type = normalizeText(log.type)
  const deltaValue = Number(log.deltaValue || 0)
  const afterValue = Number(log.afterValue || 0)
  const deltaText = `${deltaValue > 0 ? '+' : ''}${type === 'balance' ? roundMoney(deltaValue).toFixed(2) : toSafeInt(deltaValue, 0)}`
  const afterText = type === 'balance'
    ? `¥${roundMoney(afterValue).toFixed(2)}`
    : `${toSafeInt(afterValue, 0)}次`

  return {
    type,
    reason: normalizeText(log.reason),
    createTime: log.createTime || null,
    createTimeText: formatDate(log.createTime),
    deltaText,
    afterText,
    summaryText: `${deltaText} -> ${afterText}${normalizeText(log.reason) ? ` (${normalizeText(log.reason)})` : ''}`
  }
}

async function getLatestAdjustmentMap(userIds = []) {
  if (!userIds.length) {
    return {}
  }

  const res = await db.collection(USER_ADJUST_LOG_COLLECTION)
    .where({
      userId: _.in(userIds)
    })
    .orderBy('createTime', 'desc')
    .limit(Math.max(100, userIds.length * 10))
    .get()

  const map = {}
  for (const log of res.data || []) {
    const userId = normalizeText(log.userId)
    const type = normalizeText(log.type)
    if (!userId || !type) {
      continue
    }

    if (!map[userId]) {
      map[userId] = {
        latestBalanceAdjust: null,
        latestMiandanAdjust: null
      }
    }

    if (type === 'balance' && !map[userId].latestBalanceAdjust) {
      map[userId].latestBalanceAdjust = buildAdjustSummary(log)
    }

    if (type === 'miandan' && !map[userId].latestMiandanAdjust) {
      map[userId].latestMiandanAdjust = buildAdjustSummary(log)
    }
  }

  return map
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const {
    keyword = '',
    page = 0,
    pageSize = 20
  } = event

  try {
    const authorized = await ensureMerchantAuthorized(wxContext.OPENID)

    if (!authorized) {
      return {
        success: false,
        error: '请先登录商家账号'
      }
    }

    const skip = page * pageSize

    let matchCondition = {
      phoneNumber: _.exists(true).and(_.neq(''))
    }

    if (keyword) {
      matchCondition = _.and([
        matchCondition,
        _.or([
          {
            nickName: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          },
          {
            phoneNumber: db.RegExp({
              regexp: keyword,
              options: 'i'
            })
          }
        ])
      ])
    }

    const aggregateRes = await db.collection('user')
      .aggregate()
      .match(matchCondition)
      .lookup({
        from: 'freeBuy',
        localField: '_openid',
        foreignField: '_openid',
        as: 'freeBuyInfo'
      })
      .sort({
        createTime: -1
      })
      .skip(skip)
      .limit(pageSize)
      .end()

    const countRes = await db.collection('user')
      .where(matchCondition)
      .count()

    const rawList = (aggregateRes.list || []).map(user => {
      const miandanCount = user.freeBuyInfo && Array.isArray(user.freeBuyInfo) && user.freeBuyInfo.length > 0
        ? toSafeInt(user.freeBuyInfo[0].count, 0)
        : 0
      const { freeBuyInfo, ...userData } = user
      return {
        ...userData,
        balance: roundMoney(user.balance),
        miandanCount
      }
    })

    const adjustMap = await getLatestAdjustmentMap(rawList.map(user => normalizeText(user._id)).filter(Boolean))
    const list = rawList.map(user => ({
      ...user,
      latestBalanceAdjust: adjustMap[user._id] ? adjustMap[user._id].latestBalanceAdjust : null,
      latestMiandanAdjust: adjustMap[user._id] ? adjustMap[user._id].latestMiandanAdjust : null
    }))

    return {
      success: true,
      data: {
        list,
        hasMore: list.length === pageSize,
        page,
        total: countRes.total || 0
      }
    }
  } catch (err) {
    return {
      success: false,
      error: err.message || '获取用户列表失败'
    }
  }
}
