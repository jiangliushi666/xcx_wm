async function listMyOrders(options = {}) {
  const res = await wx.cloud.callFunction({
    name: 'orderList',
    data: {
      type: options.type || 'all',
      paymentState: options.paymentState || 'all',
      page: options.page || 0,
      pageSize: options.pageSize || 20
    }
  })

  const result = res.result || {}
  if (!result.success) {
    throw new Error(result.error || '获取订单列表失败')
  }

  return result.data || {
    list: [],
    hasMore: false
  }
}

module.exports = {
  listMyOrders
}
