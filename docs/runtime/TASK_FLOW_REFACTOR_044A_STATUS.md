# TASK_FLOW_REFACTOR_044A 状态记录

- 记录时间: 2026-03-29 15:40 (Asia/Shanghai)
- 执行人: Codex
- 目标: 修复回测页“开始选股”交互割裂，统一入口顺序并去掉重复选股时点；同时确认持仓监控中的公司公告来源为新浪 MCP

## 本轮完成

1. 回测页结构重排（按流程）
- 文件: `/Users/vvc/.openclaw/workspace/stock-system/backtest.html`
- 调整后顺序:
  - `选择策略`
  - `选股配置（含开始选股按钮）`
  - `添加回测股票`
- 结果: 选股结果不再被错误层级/位置掩盖，入口与研究流程一致。

2. 移除选股“重复时点”输入
- 文件: `/Users/vvc/.openclaw/workspace/stock-system/backtest.html`
- 变更:
  - 移除 `selectionDate` UI 与相关 Flatpickr 绑定逻辑。
  - `runSelection()` 改为固定使用 `startDate` 作为选股时点。
- 结果: 与“开始日期即选股时点”的约束一致，减少误配置。

3. 浏览器验收（本地）
- 页面: `http://127.0.0.1:3000/backtest.html`
- 验证点:
  - 页面顺序确认为“策略 -> 选股配置 -> 添加回测股票”。
  - 展开选股配置并点击“开始选股”，返回正常选股结果（示例: `14` 只）。
  - 已无 `selectionDate` 控件。

4. 公司公告来源复核（持仓监控）
- 脚本执行: `node scripts/monitor-positions.mjs --mode=manual`
- 监控链路确认:
  - `api/position-signals.js` 使用 `sina-ashare-mcp/scripts/call-tool.cjs` 调用 `globalStockMajorEvents`。
  - `company_events.source` 为 `sina_mcp_major_events`。
- 数据库证据:
  - `company_events` 当前有 `source=sina_mcp_major_events` 记录（示例查询显示 22 条）。

## 产出文件

- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_044A_STATUS.md`
