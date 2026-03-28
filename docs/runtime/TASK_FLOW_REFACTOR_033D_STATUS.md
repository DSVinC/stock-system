# TASK_FLOW_REFACTOR_033D 实时状态

**状态**: done  
**开始时间**: 2026-03-28 09:45  
**完成时间**: 2026-03-28 09:49  
**负责人**: Codex（方案/验收）  
**开发执行**: Codex

## 任务目标

统一“研究版本发布到策略库”与“执行流策略导入展示”的反馈字段口径，打通研究→策略库→执行流闭环。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/strategy-config.js`
- `/Users/vvc/.openclaw/workspace/stock-system/select.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/strategy-config-publish-version.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/select-import-feedback-render.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/tests/test-backtest-integration.js`

## 已完成

- 统一 `publish-version` 写入 `execution_summary_json` 结构：
  - 新增 `simulated_trade_count`
  - 新增 `position_closed_count`
  - 新增 `total_realized_pnl`
  - 新增 `avg_realized_return / avg_holding_days / trigger_failure_* / win_rate`
- `select.html` 导入策略反馈渲染新增历史数据回退：
  - `position_closed_count` 缺失时回退 `successful_trades + failed_trades`
  - `total_realized_pnl` 缺失时回退 `total_pnl`
- 新增/更新回归测试：
  - `strategy-config-publish-version.test.js` 断言新 summary 字段
  - `select-import-feedback-render.test.js` 断言历史字段回退
- 收口一个总测稳定性问题：
  - `tests/test-backtest-integration.js` 的 `TEST_002_04` 使用 `normalizeMockCode` 断言，避免代码格式差异导致偶发误判

## 验收结果

- 通过
- 验证命令：
  - `node --check /Users/vvc/.openclaw/workspace/stock-system/api/strategy-config.js`
  - `node /Users/vvc/.openclaw/workspace/stock-system/test/strategy-config-publish-version.test.js`
  - `node /Users/vvc/.openclaw/workspace/stock-system/test/select-import-feedback-render.test.js`
  - `node /Users/vvc/.openclaw/workspace/stock-system/test/strategy-config-public-feedback.test.js`
  - `node /Users/vvc/.openclaw/workspace/stock-system/tests/test-backtest-integration.js`
  - `node /Users/vvc/.openclaw/workspace/stock-system/tests/run-all-tests.js`

## 边界情况

- 旧数据中若 `execution_summary_json` 缺少新字段，页面可用回退字段稳定展示，不影响导入流程。
