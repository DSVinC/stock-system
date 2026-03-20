# TASK_FIX_002 功能验收报告

**验收任务 ID**: TASK_FIX_002  
**验收时间**: 2026-03-20  
**验收人**: Codex（验收员）  
**验收对象**: TASK_FIX_002（Codex 验收问题修复 4 项）  
**验收结论**: ❌ 不通过

## 1. 验收范围

本次按要求复验以下 4 项：

1. 访问全部 7 个页面，检查导航栏样式统一性
2. 测试回测系统策略参数面板显示功能
3. 测试条件单导入功能完整流程
4. 检查账户管理页面空状态体验

## 2. 验收环境与方法

### 2.1 环境限制

- 当前 Codex 沙箱禁止本地进程监听 `127.0.0.1:3000`，`node api/server.js` 启动时返回 `listen EPERM`
- 因此无法在本次环境内完成基于 `http://127.0.0.1:3000` 的完整浏览器联调

### 2.2 本次实际采用的验收方法

- 静态页面与样式检查：核对 7 个页面 HTML/CSS 结构
- 前端脚本模拟执行：提取并执行 `backtest.html`、`conditional-order.html`、`portfolio.html` 的关键函数
- 后端路由核对：检查 `api/server.js` 与 `api/conditional-order.js` 的实际接口
- 数据库现状检查：核对 `portfolio_account`、`conditional_order` 表内已有数据

说明：本报告结论基于“代码级可执行验证 + 路由/页面结构核对”，能够对本次修复项给出正式结论，但未覆盖受沙箱限制的本地浏览器真机联调。

## 3. 验收结果总览

| 验收项 | 结果 | 结论 |
|---|---|---|
| 7 个页面导航栏样式统一性 | ❌ 未通过 | 仍存在页面间导航结构/样式不统一 |
| 回测系统策略参数面板显示 | ✅ 通过 | 参数面板切换逻辑已恢复 |
| 条件单导入完整流程 | ⚠️ 未完全通过 | 主跳转链路存在，回测页内二次加载链路不完整 |
| 账户管理空状态体验 | ✅ 通过 | 空状态引导和摘要占位已优化 |

## 4. 详细验收记录

### 4.1 导航栏样式统一性

**验收目标**: 7 个页面导航栏样式统一，无视觉割裂。

**检查页面**:

1. `index.html`
2. `select.html`
3. `analysis.html`
4. `monitor-pool.html`
5. `portfolio.html`
6. `conditional-order.html`
7. `backtest.html`

**检查结果**:

- `analysis.html`、`portfolio.html`、`conditional-order.html`、`backtest.html` 已统一为同一套 `.top-nav + a.active` 样式
- `select.html` 仍使用独立的 `.nav-item` 体系，间距、边框、激活态命名与其他页面不同，且导航文案仍为“回测”而非“回测系统”
- `monitor-pool.html` 页面顶部没有统一导航栏，仅保留局部按钮入口
- `index.html` 仍是卡片式入口页，没有统一导航栏

**证据**:

- `select.html` 在第 129-156 行定义了独立的 `.nav-item` 样式，第 192-200 行使用该结构
- `monitor-pool.html` 第 10-71 行没有出现统一顶部导航结构
- `portfolio.html`、`conditional-order.html`、`backtest.html` 与 `analysis.html` 均已使用一致的 `.top-nav` 结构

**判定**: ❌ 未通过

**原因**:

- 若验收标准是“所有 7 个页面导航栏样式统一”，当前结果不满足
- 本次仅修复了部分页面，未实现全站统一

### 4.2 回测系统策略参数面板显示

**验收目标**: 选择策略后，策略参数面板能够正确显示。

**检查结果**:

- `backtest.html` 第 420-529 行已为 5 种策略分别提供参数面板
- `backtest.html` 第 639-659 行的 `onStrategyChange()` 会先移除所有 `.active`，再为当前策略对应面板添加 `.active`
- 通过脚本模拟执行验证：
  - 当 `strategySelect = 'double_ma'` 时，`params_double_ma` 会被激活
  - 当 `strategySelect = 'conditional'` 时，`params_conditional` 会被激活，并触发条件单列表加载逻辑

**模拟结果摘要**:

- `double_ma`: 面板激活成功
- `conditional`: 面板激活成功，条件单列表加载函数被调用 1 次

**判定**: ✅ 通过

### 4.3 条件单导入完整流程

**验收目标**: 条件单页面可将条件单导入到回测系统，用户能够完成完整导入流程。

**正向结果**:

- `conditional-order.html` 第 519 行提供“导入回测”按钮
- `conditional-order.html` 第 653-685 行的 `exportToBacktest()` 会：
  - 从当前条件单列表中取出目标数据
  - 写入 `localStorage.backtest_conditional_order`
  - 跳转到 `backtest.html?import=conditional&id=<orderId>`
- `backtest.html` 第 624-635 行在页面加载时会识别上述 URL 参数，自动切换到“自定义条件单策略”并调用加载函数
- 通过脚本模拟执行验证：
  - 导出函数会正确写入 `localStorage`
  - 页面跳转地址正确
  - 回测页初始化逻辑会自动切换策略并尝试加载该条件单

**发现的问题**:

1. `backtest.html` 第 662-679 行调用的是 `/api/conditional-order/list`
2. `api/server.js` 第 153-159 行只注册了：
   - `GET /api/conditional-order`
   - `POST /api/conditional-order`
   - `PUT /api/conditional-order/:id`
   - `DELETE /api/conditional-order/:id`
   - `POST /api/conditional-order/:id/cancel`
3. 当前服务端并没有 `GET /api/conditional-order/list`
4. `backtest.html` 第 668 行还要求返回结构为 `data.orders`
5. 实际 `api/conditional-order.js` 第 80 行返回的是 `{ success: true, data: parsedOrders }`
6. `backtest.html` 第 698 行开始还会调用 `GET /api/conditional-order/${orderId}`
7. `api/server.js` 中并没有注册该详情接口

**影响判断**:

- “条件单页面点击导入回测后直接跳转”的主链路，依赖 `localStorage`，从代码上看可以工作
- 但“回测页面内加载已保存条件单列表”和“按 ID 重新获取条件单详情”的链路不完整
- 因此本项不能认定为“完整流程 fully passed”

**判定**: ⚠️ 未完全通过

### 4.4 账户管理页面空状态体验

**验收目标**: 空账户场景下提供明确引导，不再出现大量 `-` 占位导致体验欠佳。

**检查结果**:

- `portfolio.html` 第 296-302 行提供了默认空状态引导区，包含标题、说明文案和“创建第一个账户”按钮
- `portfolio.html` 第 336-345 行的 `resetSummaryDisplay()` 会把 6 个摘要字段重置为“请选择账户”
- `portfolio.html` 第 355-371 行的 `loadAccounts()` 在空列表时会渲染优化后的空状态并重置摘要区域
- 通过脚本模拟执行验证：
  - 空状态引导文案存在
  - 6 个摘要字段都会回退为“请选择账户”

**判定**: ✅ 通过

## 5. 验收结论

**最终结论**: ❌ 不通过

**不通过原因**:

1. 导航栏样式统一性未覆盖全部 7 个页面，`select.html`、`monitor-pool.html`、`index.html` 仍与统一方案不一致
2. 条件单导入仅主跳转链路基本成立，回测页内的“条件单列表加载 / 按 ID 拉取详情”接口对接仍不完整，不能认定为“完整流程通过”

## 6. 整改建议

1. 将 `index.html`、`select.html`、`monitor-pool.html` 全部统一到同一套顶部导航结构、文案和激活态样式
2. 为条件单导入补齐接口对接，至少二选一：
   - 前端改为调用现有 `GET /api/conditional-order` 并适配返回的 `data`
   - 或后端新增 `GET /api/conditional-order/list` 与 `GET /api/conditional-order/:id`
3. 完成补齐后，再进行一次基于本地服务的浏览器真测，确认导入流程在真实页面中可用

## 7. 备注

- 本次验收中，沙箱环境不允许本地监听端口，因此未能执行 `http://127.0.0.1:3000` 下的完整浏览器联调
- 另行做的模块级调用中，数据库写操作受当前环境只读限制；该项未纳入本次 TASK_FIX_002 是否通过的判定依据
- 本报告仅针对 TASK_FIX_002 指定的 4 个复验项给出结论
