# TASK_FLOW_REFACTOR_044J 状态记录

- 记录时间: 2026-03-29 17:08 (Asia/Shanghai)
- 执行人: Codex
- 目标: 持仓监控“公司公告”链路稳健化（新浪 MCP 主链路 + Tushare 回退）并完成端到端回归

## 本轮完成

1. 公司公告同步稳健化
- 文件: `/Users/vvc/.openclaw/workspace/stock-system/api/position-signals.js`
- 变更:
  - 保留新浪 MCP 主数据源（`globalStockMajorEvents`）。
  - 增加 `isSinaMcpToolAvailable()`：当本机无 MCP 脚本或调用失败时，不中断监控主流程。
  - 增加 `fetchTushareAnnouncements()` 回退源（`tushare anns_d`），并将 `source` 标记为 `tushare_anns_d`。
  - `syncCompanyAnnouncements()` 支持依赖注入（`canUseSinaMcp/fetchSinaMajorEvents/fetchTushareAnnouncements/now`）便于测试与隔离验收。
  - 对外补充 `_internal` 导出（仅测试用途）用于覆盖核心同步逻辑。

2. 回归测试补齐
- 文件: `/Users/vvc/.openclaw/workspace/stock-system/test/position-signals-announcement-fallback.test.js`
- 覆盖场景:
  - 强制 `canUseSinaMcp=false`，验证自动走 Tushare 回退并写入 `company_events`。
  - 断言 `source=tushare_anns_d`、公告标题与证券代码正确落库。

## 验证结果

- 目标测试:
  - `node test/position-signals-announcement-fallback.test.js` ✅
  - `node test/conditional-monitor-notification-failure.test.js` ✅
- 浏览器烟测（本地服务）:
  - `node test/execution-flow-browser-smoke.test.js` ✅
  - `node test/monitor-to-conditional-browser-smoke.test.js` ✅
  - `node test/analysis-to-monitor-browser-smoke.test.js` ✅
- 全量总测:
  - `node tests/run-all-tests.js` ✅
  - 结果: `52/52` 通过（100%）

## 产出文件

- `/Users/vvc/.openclaw/workspace/stock-system/api/position-signals.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/position-signals-announcement-fallback.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_044J_STATUS.md`
