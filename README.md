# xcx_wm

多门店外卖微信小程序，面向小连锁餐饮门店的一次性交付版本。

目标是让多店铺商家拥有自己的外卖和自取入口，减少对高抽成平台的依赖。当前代码基于微信云开发，顾客端和商家端都在同一个小程序内完成。

## 当前状态

当前版本处于多门店 M1 阶段，已经支持：

- 顾客进入小程序后选择门店
- 门店基础资料维护
- 首页、结算、下单携带 `storeId`
- 订单写入 `storeId`、`storeName` 和门店快照
- 单店旧数据通过 `shopInfo` 兼容
- 商家端继续放在小程序内

暂未完成的后续里程碑：

- M2：共享菜品库 + 门店独立上下架 / 改价
- M3：总部管理员 / 门店管理员权限隔离
- M4：门店独立收款配置与支付路由
- M5：到店自取完整链路

## 主要功能

顾客端：

- 门店选择
- 菜品浏览
- 购物车
- 收货地址
- 下单结算
- 微信支付 / 余额支付
- 订单列表和订单详情

商家端：

- 商家登录和初始化
- 今日订单和经营概览
- 门店基础资料管理
- 菜品和分类管理
- 订单履约
- 会员管理
- 公告管理
- 充值套餐管理
- 入口码管理
- 打印机管理

## 目录结构

```text
cloudfunctions/
  adminOps/                 商家后台读写入口
  storefront/               顾客前台只读数据入口
  doBuy/                    下单与金额校验
  pay/                      微信支付
  pay_success/              支付回调
  orderList/                当前用户订单列表
  orderDetail/              当前用户订单详情
  userProfile/              当前用户资料
  address*/                 地址簿相关云函数
  merchantConsole/          商家中心概览
  orderAdminUpdateStatus/   商家订单状态更新
  print*/                   打印相关云函数

miniprogram/
  pages/index/              顾客首页
  pages/store/select/       门店选择
  pages/settle/             结算
  pages/myorder/            我的订单
  pages/order/detail/       订单详情
  pages/admin/              商家后台页面
  utils/                    前端 API 和业务工具
```

## 云数据库集合

建议先创建以下集合：

- `store`
- `shopInfo`
- `dishCategory`
- `dish`
- `address`
- `order`
- `user`
- `admin`
- `notice`
- `printer`
- `tableCode`
- `rechargeOptions`
- `freeBuy`
- `userAdjustLog`
- `merchantLoginAttempt`

安全要求：

- 不要把所有集合配置成匿名可写。
- 用户数据优先通过云函数读写。
- 后台管理动作必须经过商家登录校验。
- 订单、支付、余额、充值等金额相关数据必须以云函数计算结果为准。

## 云函数部署

需要部署的主要云函数：

- `login`
- `userProfile`
- `storefront`
- `getCategory`
- `get_code`
- `doBuy`
- `createRechargeOrder`
- `pay`
- `pay_success`
- `cancelPendingOrder`
- `orderList`
- `orderDetail`
- `addressList`
- `addressUpsert`
- `addressDelete`
- `addressSetDefault`
- `adminOps`
- `merchantConsole`
- `orderAdminUpdateStatus`
- `getUserList`
- `printBack`
- `printManage`

在微信开发者工具里，对每个云函数目录执行：

```text
上传并部署：云端安装依赖
```

## 环境变量

按实际使用能力配置：

- `SUB_MCH_ID`：微信支付商户号
- 商家初始化口令：首次初始化商家账号使用
- `RECHARGE_ORDER_SECRET`：充值订单快照签名密钥
- `INTERNAL_CALL_SECRET`：内部调用口令，主要用于订单自动打印
- `PRINT_APP_ID`：打印平台 App ID
- `PRINT_APP_SECRET`：打印平台 App Secret
- `PRINT_CALLBACK_SECRET`：打印回调校验口令

云函数默认使用当前云环境：

- 云函数侧使用 `cloud.DYNAMIC_CURRENT_ENV`
- 小程序侧优先使用 `wx.cloud.DYNAMIC_CURRENT_ENV`

## 本地打开

```bash
git clone https://github.com/jiangliushi666/xcx_wm.git
cd xcx_wm
```

然后用微信开发者工具打开项目根目录，创建或选择云开发环境，部署云函数并创建数据库集合。

## 验证

本地可用 Node 做语法级检查：

```powershell
Get-ChildItem -Recurse -Filter *.js |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\.git\\' } |
  ForEach-Object { node --check $_.FullName }
```

页面结构需要在微信开发者工具中编译验证。支付、回调、云函数环境变量和数据库权限必须在真实云环境中做端到端验证。

## 交付边界

当前仓库是交付型项目代码，不是完整 SaaS 平台。M1 先把门店上下文跑通，后续再逐步扩展菜单覆盖、角色权限、独立支付和运维后台。
