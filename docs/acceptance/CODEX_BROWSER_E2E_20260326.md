# V4/V5 浏览器 E2E 验收报告

执行说明：
- 目标地址：`http://127.0.0.1:3000`
- 计划方式：使用 Playwright 进行真实浏览器自动化验收
- 实际阻塞：
  - 本地 Playwright 浏览器启动被当前沙箱拦截，报错为 `MachPortRendezvous ... Permission denied (1100)`
  - 进程内访问 `127.0.0.1:3000` 也被当前沙箱拦截，报错为 `connect EPERM 127.0.0.1:3000`
- 因此本报告为“源码结构核对 + 阻塞说明”，不是一次完整成功的真实浏览器 E2E 执行结果

## 测试 1: select.html
- [x] 策略选择器 5 个选项
  - 源码存在 `#configStrategy`，包含 `double_ma`、`rsi`、`macd`、`bollinger`、`seven_factor`
- [ ] 开始选股按钮
  - 页面当前主按钮文案为“刷新选股结果”，未发现文案完全匹配“开始选股”的按钮
- [ ] 决策单字段
  - 页面脚本中已存在 `entry_zone`、`stop_loss`、`target_prices` 字段映射逻辑
  - 但由于无法执行真实浏览器点击并访问本地服务，本项未完成 E2E 级验证

## 测试 2: backtest.html
- [ ] 9 个指标卡片
  - 页面存在 9 个指标卡片，但实际字段为 `totalReturn`、`returnRate`、`annualizedReturn`、`maxDrawdown`、`sharpeRatio`、`calmarRatio`、`winRate`、`profitLossRatio`、`tradeCount`
  - 与验收要求中的 `turnover`、`sortino` 不一致
- [x] 策略选择器
  - 页面存在 `#strategySelect`

## 测试 3: iteration-manager.html
- [x] 版本列表
  - 页面存在 `#versionList`
- [ ] 开始迭代按钮
  - 页面当前按钮文案为“开始自迭代”，未发现文案完全匹配“开始迭代”的按钮

## 结论
不通过

补充说明：
- 本次未能完成真实 Playwright 浏览器验收，主要原因是当前执行环境对浏览器进程和本地回环地址访问均有限制。
- 即便忽略环境限制，页面实现与验收文案之间仍存在多处不一致：
  - `select.html` 没有“开始选股”按钮，实际为“刷新选股结果”
  - `backtest.html` 的 9 个指标字段与要求列表不完全一致
  - `iteration-manager.html` 没有“开始迭代”按钮，实际为“开始自迭代”
