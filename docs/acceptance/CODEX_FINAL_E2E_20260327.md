# V4/V5 最终 E2E 验收报告

## 验收范围说明
- 本次验收仅覆盖 `select.html`、`backtest.html`、`iteration-manager.html` 的页面级与接口级链路。
- 该结果表示这些页面和接口在本轮环境中通过，不代表 V5 全能力已经最终验收通过。
- 尤其是 `scripts/optuna_optimizer.py` 的 Optuna 自动优化仍存在 `objective` TODO 和 `score=75.0` 占位实现，不能据此写成完整闭环。

## 执行环境
- 时间：2026-03-27 09:27:23 CST
- Playwright 版本：1.58.2
- 浏览器：Chromium（本机 Playwright）
- 服务地址：http://127.0.0.1:3000
- 验收依据：
  - `docs/design/2026-03-25-backtest-upgrade-consensus.md`
  - `docs/design/2026-03-26-v4-decision-engine-solution.md`
  - `docs/api-contracts/select.md`
  - `docs/api-contracts/backtest-joint.md`
  - `docs/tasks/TASK_V5_000.md`

## 任务 1: select.html
- 页面地址：`/select.html`
- `#configStrategy` 存在，实际选项为 `double_ma`、`rsi`、`macd`、`bollinger`、`seven_factor`。通过。
- 点击“参数配置”后，配置面板正常弹出。通过。
- 点击“应用并刷新”后，页面成功请求 `/api/select`。通过。
- 接口返回满足本轮验收要求：
  - `directions` 数组数量：`10`
  - `decisions` 数组数量：`10`
  - `decisions[0]` 已包含 `entry_zone`、`stop_loss`、`target_prices`
- 选股结果卡片实际渲染数量：`10`。通过。
- 截图证据路径：`temp/screenshots/`
  - `temp/screenshots/select-e2e-20260327.png`

## 任务 2: backtest.html
- 页面地址：`/backtest.html`
- `#strategySelect` 存在。通过。
- 9 个指标卡片存在并已显示实际数据，不再全为 `--`。通过。
- 页面已完成“选股配置 -> 开始选股 -> 应用到已选股票 -> 开始回测”的实际流转。通过。
- `POST /api/backtest/joint/run` 已正常返回 `200`，不再是 `404`。通过。
- 本轮浏览器复验结果：
  - 已选股票数：`12`
  - 页面未显示错误提示
  - 指标卡已显示收益、收益率、夏普比率、胜率、交易次数等值
- 截图证据路径：`temp/screenshots/`
  - `temp/screenshots/backtest-e2e-seven-factor-20260327.png`

## 任务 3: iteration-manager.html
- 页面地址：`/iteration-manager.html`
- 策略选择器存在。通过。
- `#versionList` 存在。通过。
- 点击“开始自迭代”后，`POST /api/iteration/start` 正常返回 `200`。通过。
- 版本历史接口 `GET /api/iteration/versions/double_ma` 正常返回 `200`，页面版本列表显示 `2` 条记录。通过。
- 截图证据路径：`temp/screenshots/`
  - `temp/screenshots/iteration-e2e-20260327.png`

## 结论
通过（限定在本次页面级与接口级链路验收范围内）

## 问题清单
- 本轮未发现阻塞性 E2E 问题。
- 本轮结论不等同于 V5 全能力最终验收通过，Optuna 自动优化仍待补齐真实实现。
- 后续建议单独清理 `api/server.js` 中 Gemini 本轮引入的无关改动，避免在后续 PR 中扩大变更范围。
