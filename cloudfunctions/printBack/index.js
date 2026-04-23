// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(value) {
  return String(value || '').trim()
}

function getExpectedCallbackSecret() {
  return normalizeText(
    process.env.PRINT_CALLBACK_SECRET ||
    process.env.INTERNAL_CALL_SECRET ||
    ''
  )
}

function extractCallbackSecret(event = {}, bodyData = {}) {
  const headers = event.headers || {}
  const query = event.queryStringParameters || {}

  return normalizeText(
    event.callbackSecret ||
    event.secret ||
    bodyData.callbackSecret ||
    bodyData.secret ||
    query.callbackSecret ||
    query.secret ||
    headers['x-print-callback-secret'] ||
    headers['X-Print-Callback-Secret'] ||
    ''
  )
}

function parseBodyData(event = {}) {
  if (!event.body) {
    return event
  }

  try {
    return typeof event.body === 'string' ? JSON.parse(event.body) : event.body
  } catch (parseErr) {
    return event
  }
}

async function updatePrintStatus(bodyData = {}) {
  const { type, rtime, data } = bodyData

  if (type === 0) {
    return {
      code: 0,
      message: 'ok'
    }
  }

  if (type !== 5) {
    return {
      code: 0,
      message: 'ok'
    }
  }

  let dataObj
  try {
    dataObj = typeof data === 'string' ? JSON.parse(data) : data
  } catch (parseErr) {
    return {
      code: -1,
      message: '数据解析失败'
    }
  }

  const { sn, printId, status, outTradeNo } = dataObj || {}
  const printStatus = parseInt(status, 10)

  if (printStatus !== 2 && printStatus !== 3 && printStatus !== 4) {
    return {
      code: 0,
      message: 'ok'
    }
  }

  if (!outTradeNo) {
    return {
      code: 0,
      message: 'ok'
    }
  }

  try {
    await db.collection('order').doc(outTradeNo).update({
      data: {
        printStatus,
        printTime: db.serverDate(),
        printId,
        sn,
        rtime
      }
    })
    } catch (updateErr) {
    }

  return {
    code: 0,
    message: 'ok'
  }
}

exports.main = async (event, context) => {
  try {
    const bodyData = parseBodyData(event)
    const expectedSecret = getExpectedCallbackSecret()
    const callbackSecret = extractCallbackSecret(event, bodyData)

    if (expectedSecret && callbackSecret !== expectedSecret) {
      return {
        code: -1,
        message: 'unauthorized'
      }
    }

    return await updatePrintStatus(bodyData)
  } catch (err) {
    return {
      code: 0,
      message: 'ok'
    }
  }
}
