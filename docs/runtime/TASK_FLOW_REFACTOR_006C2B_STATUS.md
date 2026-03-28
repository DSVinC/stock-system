# TASK_FLOW_REFACTOR_006C2B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 13:18  
**完成时间**: 2026-03-27 13:22  
**负责人**: Codex（派单/实现/验收）  
**开发执行**: Codex（Claude Code 本轮未形成有效交付）  

## 任务目标

让条件单查询接口把 `conditional_order_context` 的策略上下文字段联回来，保证执行链路中的条件单在列表和详情页都能读到执行上下文。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/conditional-order.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-context-query.test.js`

## 已完成

- `getConditionalOrders()` 已通过 `LEFT JOIN conditional_order_context` 返回：
  - `strategy_source`
  - `strategy_config_id`
  - `strategy_config_name`
  - `template_id`
  - `template_name`
  - `strategy_id`
  - `strategy_version`
  - `report_id`
- `getConditionalOrder()` 已同步联表返回上述字段
- 新增查询回归测试，验证：
  - 列表 SQL 含 `LEFT JOIN conditional_order_context`
  - 详情 SQL 含 `LEFT JOIN conditional_order_context`
  - 返回结果对象包含上下文字段

## 验收结果

- 通过
- 复验命令：
  - `node test/conditional-order-context-query.test.js`

## 边界情况

- 本轮只补了查询聚合，不包含前端页面对新字段的展示
- 当前 `api/conditional-order.js` 的 diff 同时包含 `006C2A` 的写入逻辑，这是本轮继续沿用的已验收改动
- Claude Code 本轮未形成新的有效交付，主线继续由 Codex 直接补齐

## 下一步建议

1. `TASK_FLOW_REFACTOR_006C2C`
   - 对齐 `report-storage.js` / `backtest-to-conditional.js` 等其他条件单创建路径
2. `TASK_FLOW_REFACTOR_007`
   - 设计执行反馈如何在策略管理中展示
