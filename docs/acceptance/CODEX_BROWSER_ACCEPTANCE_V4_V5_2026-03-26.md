# 股票系统 V4/V5 浏览器验收报告

**验收日期**: 2026-03-26  
**验收人**: Codex  
**验收范围**: V4 选股决策单、联合回测、V5 自动迭代  
**结论**: 不通过

## 1. 验收结论

本次验收未通过，原因分为两类：

1. **环境级阻断**
   - 当前沙箱同时阻断了浏览器进程启动和对 `127.0.0.1:3000` 的 loopback 访问，无法完成真实浏览器 E2E 操作。
   - 因此本报告采用了“前端源码审查 + 项目自带验收测试 + 本地数据库核验”的补救方式。

2. **产品级缺陷**
   - `V5 iteration-manager.html` 仍是纯前端模拟页，未接入真实迭代 API。
   - `strategy_versions` 表不存在，但 `api/iteration-manager.js` 已直接查询该表，版本管理功能无法落地。
   - 项目自带验收测试 `TEST_005_03`、`TEST_005_04` 失败，止损/止盈触发逻辑未通过。
   - 决策引擎对比测试中，带决策引擎与不带决策引擎结果均为 `0` 笔交易、`0.00%` 收益，说明“联合回测实际使用决策单后产生有效交易”的验收目标没有被证明。

## 2. 验收方法与限制

### 2.1 原计划

按任务要求，本应执行以下浏览器流程：

1. `select.html` 选股并验证决策单展示
2. `backtest.html` 联合回测并验证 9 指标
3. `iteration-manager.html` 验证一键自迭代、评分、版本保存

### 2.2 实际限制

- Playwright 浏览器启动被沙箱拒绝，报错包含 `bootstrap_check_in ... Permission denied (1100)`。
- 本地 HTTP 访问也被沙箱拒绝，Node 直连 `127.0.0.1:3000` 返回 `connect EPERM 127.0.0.1:3000`。

### 2.3 补救手段

- 审查页面源码：`select.html`、`backtest.html`、`iteration-manager.html`
- 审查后端实现：`api/backtest.js`、`api/iteration-manager.js`
- 运行项目自带验收测试：`node tests/run-all-tests.js --acceptance`
- 核查本地数据库：`stock_system.db`

## 3. 功能检查清单

| 模块 | 目标 | 实际结果 | 结论 |
|------|------|----------|------|
| V4 选股决策单 | 选股结果展示 `entry_zone / stop_loss / target_prices`，支持详情弹窗 | 前端渲染逻辑已实现，但本轮无法做真实浏览器点击；源码确认字段已接线 | 部分通过 |
| V4 日期选择 | 选股页可选日期并禁用非交易日 | `select.html` 无日期输入控件；与简报场景不一致 | 不通过 |
| V4 联合回测 | 核心/卫星联合回测，展示 9 个指标 | 页面与 API 接线存在；自带验收测试显示 0 笔交易，止损/止盈测试失败 | 不通过 |
| V5 一键自迭代 | 从回测页进入自迭代页并执行真实优化 | 回测页按钮仅跳转页面，不执行迭代 | 不通过 |
| V5 评分系统 | 展示真实评分结果和图表 | 页面显示的是静态模拟数据，无 API 调用 | 不通过 |
| V5 版本管理 | 保存/读取/对比版本 | 页面无真实接线；数据库缺少 `strategy_versions` 表；API 将直接失败 | 不通过 |

## 4. 详细验收记录

## 4.1 V4 选股决策单

### 实际表现

- `select.html` 会调用 `/api/select`，并把返回的 `decisions` 合并到 Top10 股票卡片中，渲染 `decision / entry_zone / stop_loss / target_prices`，并提供“详情”弹窗。
- 对应代码位于 [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L1074) 到 [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L1455)。
- 选股参数面板只包含策略、股票数量、最低评分、决策过滤，没有日期选择器，对应 [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L827) 到 [select.html](/Users/vvc/.openclaw/workspace/stock-system/select.html#L872)。

### 结论

- **决策单展示链路在前端代码层面已接线。**
- **但“选择日期、验证非交易日标记”的验收场景无法在 `select.html` 完成，因为页面根本没有日期控件。**

### 风险

- 本地数据库中的 `stock_factor_snapshot` 只有 `2` 个交易日快照，范围是 `20200102` 到 `20210104`，和简报中的 2026 数据预期不一致。
- 这意味着即使解除沙箱限制，`select.html` 也很可能无法稳定演示最新时点选股。

## 4.2 V4 联合回测

### 实际表现

- 回测页存在 9 个指标卡片：总收益、收益率、年化收益、最大回撤、夏普比率、卡玛比率、胜率、盈亏比、交易次数，对应 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L1882) 到 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L1917)。
- 页面点击“开始回测”后，会向 `/api/backtest/joint/run` 发请求，提交：
  - `coreWeight`
  - `satelliteWeight`
  - `satelliteStock`
  - `coreStrategy`
  - `gridConfig`
  对应 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L2950) 到 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L3009)。
- 回测页存在交易日校验逻辑，会加载 `/api/trading-days`，并在用户输入非法日期时回退到最近有效交易日；但这属于“输入后纠正”，不是“日期面板直接禁用周末/节假日”，对应 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L2195) 到 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L2321)。

### 自带验收测试结果

执行：

```bash
node tests/run-all-tests.js --acceptance
```

结果摘要：

- `TEST_005_01` 引擎对比：
  - 带决策引擎：`总收益率 0.00%`，`交易次数 0`
  - 不带决策引擎：`总收益率 0.00%`，`交易次数 0`
- `TEST_005_03` 止损效果验证失败：
  - `下跌 10%，触发止损 - 应该触发止损`
- `TEST_005_04` 止盈效果验证失败：
  - `上涨 5%，触发止盈 - 应该触发止盈`
- 总体：`4 通过, 2 失败`，通过率 `66.7%`

相关断言位置：

- [tests/test-acceptance.js](/Users/vvc/.openclaw/workspace/stock-system/tests/test-acceptance.js#L394) 到 [tests/test-acceptance.js](/Users/vvc/.openclaw/workspace/stock-system/tests/test-acceptance.js#L459)
- [tests/test-acceptance.js](/Users/vvc/.openclaw/workspace/stock-system/tests/test-acceptance.js#L464) 到 [tests/test-acceptance.js](/Users/vvc/.openclaw/workspace/stock-system/tests/test-acceptance.js#L509)

### 结论

- **联合回测 UI 和 API 入口存在。**
- **但验收测试无法证明决策引擎已带来有效交易，且止损/止盈触发逻辑当前未通过。**
- **“联合回测通过”不能签字。**

## 4.3 V5 自迭代优化

### 实际表现

- 回测页的“一键自迭代”按钮只做页面跳转，没有传递当前回测配置，也没有直接启动优化，对应 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L3012) 到 [backtest.html](/Users/vvc/.openclaw/workspace/stock-system/backtest.html#L3015)。
- `iteration-manager.html` 的 `startIteration()` 仍是本地 `for` 循环 + `setTimeout(1000)` 的假进度条，源码明确写着 `TODO: 实现真实的迭代逻辑`，对应 [iteration-manager.html](/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html#L324) 到 [iteration-manager.html](/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html#L354)。
- 页面中没有任何 `fetch('/api/iteration/...')` 调用，因此不会实际触发后端迭代。
- 雷达图和数据是静态演示值，且整块 DOM 被写在 `</html>` 之后，对应 [iteration-manager.html](/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html#L391) 到 [iteration-manager.html](/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html#L430)。

### 后端与数据库一致性

- 后端版本历史接口会直接查询 `strategy_versions` 表，对应 [api/iteration-manager.js](/Users/vvc/.openclaw/workspace/stock-system/api/iteration-manager.js#L172) 到 [api/iteration-manager.js](/Users/vvc/.openclaw/workspace/stock-system/api/iteration-manager.js#L188)。
- 但当前数据库只存在：
  - `strategy_score_records`
  - `strategy_iteration_log`
- **不存在 `strategy_versions` 表。**

这意味着：

1. 版本历史查询会失败
2. 版本对比查询也会失败
3. 页面中的“版本管理”即使补了前端请求，也没有可用底座

### 结论

- **V5 页面目前不是“自动迭代系统”，而是未接线的静态原型。**
- **版本管理未打通，评分可视化也不是实时数据。**

## 5. 发现的问题

### P0

1. **V5 自迭代页面未接真实 API**
   - 证据：`iteration-manager.html` 只有本地循环模拟，没有 `fetch` 调用。
   - 影响：一键自迭代、评分、版本保存全部无法真实工作。

2. **数据库缺少 `strategy_versions` 表**
   - 证据：`sqlite_master` 查询仅有 `strategy_score_records`、`strategy_iteration_log`。
   - 影响：`/api/iteration/versions/:strategyType`、`/api/iteration/compare` 无法正常返回。

3. **止损/止盈验收测试失败**
   - 证据：`node tests/run-all-tests.js --acceptance` 中 `TEST_005_03` 与 `TEST_005_04` 失败。
   - 影响：决策单的核心风控逻辑不可靠。

### P1

4. **回测页“一键自迭代”只是跳转**
   - 证据：`startAutoIteration()` 仅 `window.location.href = 'iteration-manager.html'`。
   - 影响：不满足 V5“从回测结果发起自动迭代”的验收预期。

5. **选股页缺少日期选择器**
   - 证据：`select.html` 配置面板没有日期字段。
   - 影响：无法覆盖简报要求的“选择日期并验证非交易日”的场景。

6. **交易日校验不是“禁用周末/节假日”**
   - 证据：`backtest.html` 是用户选择后再弹 Toast 并回退。
   - 影响：与“日期选择器直接标记或禁用非交易日”的验收标准仍有差距。

### P2

7. **`iteration-manager.html` 结构不规范**
   - 证据：评分雷达图 DOM 和脚本写在 `</html>` 之后。
   - 影响：真实浏览器中的解析结果依赖容错机制，不利于稳定验收。

## 6. 截图证据

本轮没有产出截图，原因是沙箱阻断了浏览器进程启动。  
可复验前提：

1. 允许本地浏览器进程启动
2. 允许当前会话访问 `127.0.0.1:3000`

解除后建议重新执行浏览器验收，并补齐：

- `select.html` 选股结果页截图
- 决策详情弹窗截图
- `backtest.html` 9 指标结果截图
- `iteration-manager.html` 页面截图

## 7. 修复建议

1. 先补齐 `strategy_versions` 迁移和落表，再接通 `api/iteration-manager.js`。
2. 将 `iteration-manager.html` 的 `startIteration()` 改为真实调用：
   - `POST /api/iteration/start`
   - 轮询 `GET /api/iteration/status/:taskId`
   - 查询 `GET /api/iteration/versions/:strategyType`
3. 回测页“一键自迭代”应携带当前策略、股票池、日期范围跳转，或直接创建迭代任务。
4. 修复止损/止盈逻辑，使 `tests/test-acceptance.js` 全量通过。
5. `select.html` 增加日期输入，并明确交易日处理逻辑，补齐与任务简报一致的交互。
6. 将 `iteration-manager.html` 中 `</html>` 之后的图表代码移回正常 DOM 结构内。

## 8. 最终判断

从产品验收角度看：

- `V4` 有部分可用界面与接线，但回测核心验证未过。
- `V5` 仍停留在原型页阶段，未达到“自动迭代系统”验收标准。

**本次 V4/V5 浏览器验收结论：不通过。**
