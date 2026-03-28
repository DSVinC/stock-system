# TASK_FLOW_REFACTOR_015F 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:36  
**完成时间**: 2026-03-27 18:39  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Claude Code（首轮尝试） + Codex（最小补丁收口）  

## 任务目标

让条件单列表/详情 API 在已有 `strategy_config_id` 时带出执行反馈摘要，供执行流页面后续显示反馈状态、置信度和关键统计。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/conditional-order.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-context-query.test.js`

## 已完成

- 已先补复现测试，确认列表/详情查询尚未联表 `strategy_config_feedback`
- `getConditionalOrders()` 和 `getConditionalOrder()` 现在都已追加：
  - `LEFT JOIN strategy_config_feedback scf ON scf.strategy_config_id = coc.strategy_config_id`
- 两个查询都已返回：
  - `execution_feedback_status`
  - `execution_feedback_confidence`
  - `total_trades`
  - `total_pnl`
- 既有 `conditional_order_context` 字段保持不变，没有回退

## 验收结果

- 通过
- 复验命令：
  - `node test/conditional-order-context-query.test.js`
  - `node --check api/conditional-order.js`

## 边界情况

- 这一步只补“查询层反馈透传”，还没有把反馈标签真正渲染到条件单页面。
- 如果某条条件单没有 `strategy_config_id` 或没有对应 feedback 快照，返回字段会是空值，这是当前预期。

## 下一步建议

1. 继续做 `015G`：
   - 在 `conditional-order.html` 列表中显示 `execution_feedback_status / execution_feedback_confidence`
2. 补一个浏览器级回归：
   - 从选股/分析导入创建条件单后，列表中能同时看到“策略来源 + 执行反馈”
