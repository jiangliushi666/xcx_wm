/**
 * 前端常量配置
 * 集中管理项目中的魔法数字和配置项
 */

// ==================== 时间相关常量 ====================

/** 加载延迟时间（毫秒），防止闪烁 */
const LOADING_DELAY_MS = 100

/** Toast显示时间（毫秒） */
const TOAST_DURATION_MS = 1500

/** 订单支付超时时间（分钟） */
const PAYMENT_EXPIRE_MINUTES = 15

/** 订单支付超时时间（毫秒） */
const PAYMENT_EXPIRE_MS = PAYMENT_EXPIRE_MINUTES * 60 * 1000

/** 页面跳转延迟时间（毫秒） */
const NAVIGATE_DELAY_MS = 1500

// ==================== 分页相关常量 ====================

/** 默认每页数量 */
const DEFAULT_PAGE_SIZE = 20

/** 最大每页数量 */
const MAX_PAGE_SIZE = 50

/** 最小每页数量 */
const MIN_PAGE_SIZE = 1

// ==================== 金额相关常量 ====================

/** 金额精度容差 */
const AMOUNT_TOLERANCE = 0.0001

/** 最小支付金额 */
const MIN_PAY_AMOUNT = 0.01

/** 最大支付金额 */
const MAX_PAY_AMOUNT = 10000

/** 金额小数位数 */
const MONEY_DECIMAL_PLACES = 2

// ==================== 商品相关常量 ====================

/** 最大商品数量 */
const MAX_GOODS_COUNT = 99

/** 最小商品数量 */
const MIN_GOODS_COUNT = 1

// ==================== 输入限制常量 ====================

/** 备注最大长度 */
const MAX_REMARK_LENGTH = 200

/** 密码最小长度 */
const MIN_PASSWORD_LENGTH = 6

/** 密码最大长度 */
const MAX_PASSWORD_LENGTH = 20

/** 用户名最大长度 */
const MAX_USERNAME_LENGTH = 20

/** 地址最大长度 */
const MAX_ADDRESS_LENGTH = 100

// ==================== 状态码常量 ====================

/** 订单状态：待支付 */
const ORDER_STATUS_PENDING = 0

/** 订单状态：待接单 */
const ORDER_STATUS_ACCEPTED = 1

/** 订单状态：备餐中 */
const ORDER_STATUS_PREPARING = 2

/** 订单状态：配送中 */
const ORDER_STATUS_DELIVERING = 3

/** 订单状态：已完成 */
const ORDER_STATUS_COMPLETED = 4

/** 订单状态：已取消 */
const ORDER_STATUS_CANCELLED = 5

// ==================== 支付方式常量 ====================

/** 支付方式：微信支付 */
const PAY_METHOD_WECHAT = 'wechat'

/** 支付方式：余额支付 */
const PAY_METHOD_BALANCE = 'balance'

// ==================== 配送方式常量 ====================

/** 配送方式：外卖配送 */
const DELIVERY_TYPE_DELIVERY = 'delivery'

/** 配送方式：到店自取 */
const DELIVERY_TYPE_PICKUP = 'pickup'

// ==================== 缓存键名常量 ====================

/** openid缓存键 */
const CACHE_KEY_OPENID = 'openid'

/** 购物车缓存键 */
const CACHE_KEY_CART = 'cart'

/** 结算购物车缓存键 */
const CACHE_KEY_SETTLE_CART = 'settleCartData'

/** 选中地址缓存键 */
const CACHE_KEY_SELECTED_ADDRESS = 'settleSelectedAddressId'

/** 选中门店缓存键 */
const CACHE_KEY_SELECTED_STORE = 'selectedStore'

/** 选中门店ID缓存键 */
const CACHE_KEY_SELECTED_STORE_ID = 'selectedStoreId'

// ==================== 云函数名称常量 ====================

/** 登录云函数 */
const CLOUD_FUNCTION_LOGIN = 'login'

/** 支付云函数 */
const CLOUD_FUNCTION_PAY = 'pay'

/** 下单云函数 */
const CLOUD_FUNCTION_DO_BUY = 'doBuy'

/** 取消订单云函数 */
const CLOUD_FUNCTION_CANCEL_ORDER = 'cancelPendingOrder'

/** 管理操作云函数 */
const CLOUD_FUNCTION_ADMIN_OPS = 'adminOps'

/** 商家中心云函数 */
const CLOUD_FUNCTION_MERCHANT_CONSOLE = 'merchantConsole'

/** 用户信息云函数 */
const CLOUD_FUNCTION_USER_PROFILE = 'userProfile'

/** 店铺信息云函数 */
const CLOUD_FUNCTION_STOREFRONT = 'storefront'

/** 地址列表云函数 */
const CLOUD_FUNCTION_ADDRESS_LIST = 'addressList'

// ==================== 错误消息常量 ====================

/** 通用错误消息 */
const ERROR_GENERIC = '操作失败，请重试'

/** 网络错误消息 */
const ERROR_NETWORK = '网络异常，请检查网络连接'

/** 登录失败消息 */
const ERROR_LOGIN = '登录失败，请重试'

/** 支付失败消息 */
const ERROR_PAY = '支付失败，请重试'

/** 加载失败消息 */
const ERROR_LOAD = '加载失败，请重试'

/** 权限不足消息 */
const ERROR_PERMISSION = '权限不足'

/** 订单不存在消息 */
const ERROR_ORDER_NOT_FOUND = '订单不存在'

/** 余额不足消息 */
const ERROR_BALANCE_INSUFFICIENT = '余额不足'

module.exports = {
  // 时间相关
  LOADING_DELAY_MS,
  TOAST_DURATION_MS,
  PAYMENT_EXPIRE_MINUTES,
  PAYMENT_EXPIRE_MS,
  NAVIGATE_DELAY_MS,
  
  // 分页相关
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
  
  // 金额相关
  AMOUNT_TOLERANCE,
  MIN_PAY_AMOUNT,
  MAX_PAY_AMOUNT,
  MONEY_DECIMAL_PLACES,
  
  // 商品相关
  MAX_GOODS_COUNT,
  MIN_GOODS_COUNT,
  
  // 输入限制
  MAX_REMARK_LENGTH,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
  MAX_USERNAME_LENGTH,
  MAX_ADDRESS_LENGTH,
  
  // 订单状态
  ORDER_STATUS_PENDING,
  ORDER_STATUS_ACCEPTED,
  ORDER_STATUS_PREPARING,
  ORDER_STATUS_DELIVERING,
  ORDER_STATUS_COMPLETED,
  ORDER_STATUS_CANCELLED,
  
  // 支付方式
  PAY_METHOD_WECHAT,
  PAY_METHOD_BALANCE,
  
  // 配送方式
  DELIVERY_TYPE_DELIVERY,
  DELIVERY_TYPE_PICKUP,
  
  // 缓存键名
  CACHE_KEY_OPENID,
  CACHE_KEY_CART,
  CACHE_KEY_SETTLE_CART,
  CACHE_KEY_SELECTED_ADDRESS,
  CACHE_KEY_SELECTED_STORE,
  CACHE_KEY_SELECTED_STORE_ID,
  
  // 云函数名称
  CLOUD_FUNCTION_LOGIN,
  CLOUD_FUNCTION_PAY,
  CLOUD_FUNCTION_DO_BUY,
  CLOUD_FUNCTION_CANCEL_ORDER,
  CLOUD_FUNCTION_ADMIN_OPS,
  CLOUD_FUNCTION_MERCHANT_CONSOLE,
  CLOUD_FUNCTION_USER_PROFILE,
  CLOUD_FUNCTION_STOREFRONT,
  CLOUD_FUNCTION_ADDRESS_LIST,
  
  // 错误消息
  ERROR_GENERIC,
  ERROR_NETWORK,
  ERROR_LOGIN,
  ERROR_PAY,
  ERROR_LOAD,
  ERROR_PERMISSION,
  ERROR_ORDER_NOT_FOUND,
  ERROR_BALANCE_INSUFFICIENT
}
