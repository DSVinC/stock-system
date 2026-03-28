# V4/V5 最终 E2E 验收报告

## 执行环境
- 时间：2026-03-26 18:57:24 CST
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
- `#configStrategy` 存在，实际选项为 `double_ma`、`rsi`、`macd`、`bollinger`、`seven_factor`。该项通过。
- 点击“参数配置”后，`#configPanel` 成功弹出。该项通过。
- 填写参数并刷新后，页面能正常请求 `/api/select`，并渲染 Top3 行业与 Top10 股票卡片。该项通过。
- 但接口返回未满足验收要求：
  - 实际响应：`GET /api/select?limit=5&strategy=seven_factor`
  - `directions` 数组存在，数量 `10`
  - `decisions` 数组不存在有效数据，数量 `0`
  - 因此“返回包含 `directions` 和 `decisions`，且决策单含 `entry_zone` / `stop_loss` / `target_prices`”这一项不通过。
- 截图证据路径：`temp/screenshots/`
  - `temp/screenshots/select-initial.png`
  - `temp/screenshots/select-config-panel.png`
  - `temp/screenshots/select-results.png`

## 任务 2: backtest.html
- 页面地址：`/backtest.html`
- `#strategySelect` 存在。该项通过。
- 9 个指标卡片 DOM 均存在：
  - `totalReturn`
  - `returnRate`
  - `annualizedReturn`
  - `maxDrawdown`
  - `sharpeRatio`
  - `calmarRatio`
  - `winRate`
  - `profitLossRatio`
  - `tradeCount`
  该项通过。
- 已在页面中配置核心/卫星仓位为 `60% / 40%`，并通过内嵌选股添加了 `5` 只股票到已选列表。
- 但点击“开始回测”后未形成有效回测：
  - 浏览器端未抓到成功的 `POST /api/backtest/joint/run` 响应
  - 结果面板未显示
  - 9 个指标卡片仍全部为 `--`
  - 图表容器存在，但无有效回测数据，权益曲线未形成有效结果
- 同时发现一个页面/合同不一致问题：
  - 页面不存在 `#maxPosition` 输入控件
  - 但前端请求组装逻辑和 API 合同都引用了 `gridConfig.maxPosition`
- 综合判断：任务 2 不通过。
- 截图证据路径：`temp/screenshots/`
  - `temp/screenshots/backtest-initial.png`
  - `temp/screenshots/backtest-results.png`

## 任务 3: iteration-manager.html
- 页面地址：`/iteration-manager.html`
- `#strategySelect` 存在。该项通过。
- `#versionList` 存在。该项通过。
- 点击“开始自迭代”后，页面实际调用了 `POST /api/iteration/start`，但运行服务返回 `404`：
  - 响应：`{"success":false,"message":"未找到接口或页面: /api/iteration/start"}`
  - 因此“API 调用正常”这一项不通过。
- 页面初始化请求 `GET /api/iteration/versions/seven_factor` 同样返回 `404`：
  - 响应：`{"success":false,"message":"未找到接口或页面: /api/iteration/versions/seven_factor"}`
  - 版本历史区域最终显示“暂无版本记录”
  - 因此“版本历史表格显示数据”这一项不通过。
- 综合判断：任务 3 不通过。
- 截图证据路径：`temp/screenshots/`
  - `temp/screenshots/iteration-initial.png`
  - `temp/screenshots/iteration-after-start.png`

## 结论
不通过

## 问题清单
- `select.html` 的刷新选股结果接口未返回有效 `decisions` 数组，无法满足 V4 决策单联动验收标准。
  - 复现步骤：
    1. 打开 `/select.html`
    2. 点击“参数配置”
    3. 选择 `seven_factor`，数量设为 `5`
    4. 点击“应用并刷新”
    5. 观察 `/api/select` 响应，仅有 `directions`，`decisions` 数量为 `0`
- `backtest.html` 选择 `seven_factor` 并完成选股后，点击“开始回测”不能产出有效回测结果。
  - 复现步骤：
    1. 打开 `/backtest.html`
    2. 设置核心/卫星仓位为 `60/40`
    3. 策略选择 `seven_factor`
    4. 展开“选股配置”，点击“开始选股”
    5. 点击“应用到已选股票”
    6. 点击“开始回测”
    7. 观察结果区未展示，指标仍为 `--`
- `backtest.html` 页面缺少 `#maxPosition` 控件，但页面逻辑与 API 合同都引用该字段，存在前后不一致风险。
- `iteration-manager.html` 依赖的 V5 接口在当前运行服务中返回 `404`，自迭代链路未打通。
  - 复现步骤：
    1. 打开 `/iteration-manager.html`
    2. 点击“开始自迭代”
    3. 观察 `POST /api/iteration/start` 返回 `404`
    4. 刷新或初始化时观察 `GET /api/iteration/versions/seven_factor` 返回 `404`
