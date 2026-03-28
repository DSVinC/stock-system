# V4 修复验收报告（Codex 复验）

**验收时间**: 2026-03-26  
**验收员**: Codex  
**验收方式**: 契约脚本复验 + 前端/后端代码复核 + 本地浏览器链路复测  
**验收范围**: `backtest.html`、`select.html`、`api/backtest.js`、`api/select.js`、`scripts/verify-api-contract.sh select`

## 验收结论

本轮 V4 修复复验 **未通过**。

| 验收项 | 结论 | 说明 |
|---|---|---|
| 浏览器功能测试 | ⚠️ 未完成 | 当前会话无法访问 `127.0.0.1:3000`，动态页面复测被环境限制阻塞 |
| 选股时点验证 | ⚠️ 代码路径已修复，未完成动态复验 | 前端会传 `date`，后端会按 `stock_factor_snapshot` 查询 |
| 核心仓/卫星仓比例验证 | ⚠️ 代码路径已修复，未完成动态复验 | 前端已发送 `coreWeight/satelliteWeight`，后端联合回测已接收 |
| 回测指标验证 | ❌ 未通过 | 结果区仍未展示卡玛比率、盈亏比 |
| 契约验证 | ❌ 未通过 | `bash scripts/verify-api-contract.sh select` 仍失败 |

## 本轮实际执行

### 1. 浏览器功能测试

目标页面：

- `http://127.0.0.1:3000/backtest.html`
- `http://127.0.0.1:3000/select.html`

本轮尝试结果：

- `curl -I http://127.0.0.1:3000/backtest.html` 失败，退出码 `7`
- 使用 `python3` 建立 socket 连接 `127.0.0.1:3000` 返回：`PermissionError [Errno 1] Operation not permitted`
- Playwright MCP 浏览器调用在当前会话中被取消，未能建立浏览器会话

结论：

当前 Codex 会话存在本地网络访问限制，无法对已运行服务执行真实浏览器交互。因此第 1、2、3 项中的动态行为验证，本轮只能做到代码链路复核，不能给出真实页面交互通过结论。

### 2. 选股时点验证

已复核代码链路：

- `backtest.html` 的 `runSelection()` 会读取 `selectionDate`，并在有值时执行 `params.set('date', date)`
- `backtest.html` 通过 `fetch(\`/api/select?\${params.toString()}\`)` 发起请求
- `api/select.js` 的 `GET /api/select` 已接收 `req.query.date`
- `api/select.js` 的 `buildSelectionPayload(date, strategy, filters)` 在有 `date` 时切换到 `buildSelectionPayloadFromSnapshot(...)`
- `buildSelectionPayloadFromSnapshot(...)` 会查询 `stock_factor_snapshot`，并在非交易日向后调整到最近交易日

判定：

- 代码层面，V4 选股时点修复链路存在
- 由于无法访问运行中的本地服务，本轮 **未能实际验证不同日期是否返回不同结果**

### 3. 核心仓/卫星仓比例验证

已复核代码链路：

- `backtest.html` 的 `runBacktest()` 调用 `/api/backtest/joint/run`
- 请求体中发送：
  - `coreWeight: portfolioConfig.core / 100`
  - `satelliteWeight: portfolioConfig.satellite / 100`
- `api/backtest.js` 的联合回测逻辑已接收并使用：
  - `coreWeight`
  - `satelliteWeight`

判定：

- 代码层面，权重参数已接通
- 由于无法执行真实接口调用，本轮 **未能实际验证调整比例后回测结果是否变化**

### 4. 回测指标验证

后端已补齐：

- `api/backtest.js` 已计算 `calmarRatio`
- `api/backtest.js` 已计算 `profitLossRatio`
- `api/backtest.js` 的 `summary` 已返回 `calmarRatio`、`profitLossRatio`

前端结果区仍未补齐：

- `backtest.html` 结果区当前仅展示：
  - 总收益
  - 收益率
  - 最大回撤
  - 夏普比率
  - 胜率
  - 交易次数
- `backtest.html` 的 `displayResults(data)` 仅更新上述 6 个 DOM 节点
- 未发现卡玛比率、盈亏比对应的结果卡片或赋值逻辑

判定：

该项 **未通过**。后端虽已返回指标，但前端结果区未展示，未满足验收目标。

### 5. 契约验证

已执行：

```bash
bash scripts/verify-api-contract.sh select
```

结果：**失败**

失败输出要点：

- `DOM ID 不存在：strategyTemplate (文件：backtest.html)`
- `DOM ID 不存在：loadTemplateBtn (文件：backtest.html)`
- `DOM ID 不存在：maxPosition (文件：backtest.html)`
- `DOM ID 不存在：templateDescription (文件：backtest.html)`

判定：

契约验证 **未通过**。`backtest.html` 仍保留旧模板逻辑的脚本引用，但对应 DOM 已不存在。

## 额外发现

### 1. `select.html` 仍保留“策略模板”逻辑

本轮复核发现：

- `select.html` 页面文案仍为“策略模板”
- `select.html` 仍存在：
  - `strategyTemplate`
  - `loadTemplateBtn`
  - `templateDescription`
- `select.html` 仍请求：
  - `/api/strategy-template/list`
  - `/api/strategy-template/{id}`

这说明 V4 所要求的界面统一重构并未完全完成。

### 2. `backtest.html` 脚本与 DOM 结构仍不一致

本轮复核发现：

- `backtest.html` 中仍定义并调用：
  - `loadStrategyTemplates()`
  - `populateTemplateSelect()`
  - `loadTemplateParams()`
- 上述逻辑内部仍直接访问：
  - `document.getElementById('strategyTemplate')`
  - `document.getElementById('loadTemplateBtn')`
  - `document.getElementById('templateDescription')`
  - `document.getElementById('maxPosition')`

但契约脚本已证明这些 DOM ID 在当前页面结构中不存在，因此这是实际残留问题，不是脚本误报。

## 最终判定

本轮复验 **不通过**。

阻塞项：

1. `backtest.html` 结果区仍未展示卡玛比率、盈亏比
2. `scripts/verify-api-contract.sh select` 仍失败
3. `select.html` 与 `backtest.html` 仍残留旧“策略模板”逻辑，页面结构与脚本未完全同步

待补测项：

1. 在允许访问本地 `127.0.0.1:3000` 的环境中，重新执行真实浏览器验收
2. 验证不同 `date` 是否返回不同选股结果
3. 验证不同 `coreWeight/satelliteWeight` 是否导致回测结果变化

## 复验建议

建议开发先完成以下修复后再提测：

1. 为 `backtest.html` 结果区补充卡玛比率、盈亏比的展示卡片与赋值逻辑
2. 清理 `backtest.html` 中失效的模板相关 DOM 引用，或补回对应 DOM
3. 将 `select.html` 从“策略模板”交互统一为当前 V4 设计要求
4. 在可访问本地服务的环境中重新执行浏览器验收，补齐动态证据
