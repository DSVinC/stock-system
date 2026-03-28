# TASK_FLOW_REFACTOR_007B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 14:06  
**完成时间**: 2026-03-27 14:09  
**负责人**: Codex（方案/验收）  
**开发执行**: Codex  

## 任务目标

在条件单执行成功并写入 `portfolio_trade` 后，同步写入一条 `simulated_trade` 到 `execution_feedback`。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/conditional-executor.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-execution-feedback.test.js`

## 先复现的问题

- 当前执行器只写 `portfolio_trade`
- 没有把成交结果沉淀到 `execution_feedback`

## 已完成

- 新增复现测试，确认旧执行链路不会写 `simulated_trade`
- `recordTrade()` 现已返回 `tradeId`
- 新增 `recordExecutionFeedback()`：
  - 读取 `conditional_order_context`
  - 写入 `execution_feedback`
  - 事件类型为 `simulated_trade`
- 反馈内容已包含：
  - 条件单 ID / 交易 ID
  - 策略上下文快照
  - `version_id`（当前先复用 `strategy_version`）
  - 成交数量、价格、金额
  - `execution_mode`

## 验收结果

- 通过
- 复验命令：
  - `node --check api/conditional-executor.js`
  - `node test/conditional-execution-feedback.test.js`

## 边界情况

- 当前 `version_id` 先复用 `strategy_version`
- `realized_pnl / realized_return / holding_days` 还未在 `simulated_trade` 阶段计算

## 下一步建议

1. `TASK_FLOW_REFACTOR_007C`
   - 条件触发但未成交时写入 `conditional_trigger`
