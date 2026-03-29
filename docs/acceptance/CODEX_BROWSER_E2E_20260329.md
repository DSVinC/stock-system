# V4/V5 浏览器 E2E 验收报告

## 执行环境
- 时间: 2026-03-29 09:51 (Asia/Shanghai)
- Playwright: 1.58.2
- 浏览器: Chromium (headless)
- 服务地址: `http://127.0.0.1:3000`
- 执行脚本: `temp/e2e-runner.js`

## 测试 1: select.html
- [x] 策略选择器 5 个选项（`double_ma/rsi/macd/bollinger/seven_factor`）
- [x] 参数配置面板可打开
- [x] 选股 API 返回 `directions + decisions`，且决策单包含 `entry_zone/stop_loss/target_prices`
- [x] 选股结果卡片可见

截图:
- `temp/screenshots/select-initial.png`
- `temp/screenshots/select-config-panel.png`
- `temp/screenshots/select-results.png`

## 测试 2: backtest.html
- [x] 策略选择器存在
- [x] 9 个指标位存在并有值（`totalReturn/returnRate/annualizedReturn/maxDrawdown/sharpeRatio/calmarRatio/winRate/profitLossRatio/tradeCount`）
- [x] 核心/卫星权重设置后可运行回测
- [x] 回测图表渲染正常（占位符隐藏、canvas 可见、交易数 > 0）

截图:
- `temp/screenshots/backtest-initial.png`
- `temp/screenshots/backtest-results.png`
- `temp/screenshots/validation-fix/backtest-chart-after-fix-20260329.png`

## 测试 3: iteration-manager.html
- [x] 策略选择器存在
- [x] 版本列表容器存在（`#versionList`）
- [x] 可启动迭代，`/api/iteration/start` 调用成功
- [x] 版本历史展示正常

截图:
- `temp/screenshots/iteration-initial.png`
- `temp/screenshots/iteration-after-start.png`

## 结论
**通过**

全部 E2E 验收检查项通过（`select/backtest/iteration` 全绿）。
