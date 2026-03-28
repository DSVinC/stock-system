# TASK_FLOW_REFACTOR_007D 实时状态

**状态**: done  
**开始时间**: 2026-03-27 15:02  
**完成时间**: 2026-03-27 15:22  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code（主修复） + Codex（回归收口/验收）  

## 任务目标

在“卖出导致持仓完全关闭”的场景下，写入 `execution_feedback.event_type = position_closed`，让研究流能够消费真实的平仓反馈。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/conditional-executor.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/position-closed-feedback.test.js`

## 先复现的问题

- 清仓卖出后，没有写入 `position_closed`
- 缺少 `realized_pnl / realized_return / holding_days` 的闭环反馈

## 已完成

- 新增复现测试，明确：
  - 只有 full sell 清仓才写 `position_closed`
  - `position_closed` 必须携带：
    - `trade_id`
    - `quantity`
    - `price`
    - `amount`
    - `realized_pnl`
    - `realized_return`
    - `holding_days`
    - `version_id`
- `applySell()` 现在会返回：
  - `positionClosed`
  - `closedQuantity`
  - `realizedPnl`
  - `realizedReturn`
  - `holdingDays`
- 条件单执行器在 sell 成功且 full close 时，现已额外写入：
  - `execution_feedback.position_closed`
- 兼容性收口：
  - 旧环境缺少 `conditional_order_context / execution_feedback` 表时，仍会安全降级
- 代码卫生收口：
  - `recordPositionClosedFeedback` 已收敛为单份实现

## 验收结果

- 通过
- 复验命令：
  - `node --check api/conditional-executor.js`
  - `node test/position-closed-feedback.test.js`
  - `node test/conditional-trigger-feedback.test.js`
  - `node test/conditional-execution-feedback.test.js`
  - `node test/conditional-executor-check.js`

## 边界情况

- 当前只在 full sell 清仓时写 `position_closed`
- partial sell 仍只写 `simulated_trade`，不写平仓反馈
- `version_id` 当前继续复用 `strategy_version`，后续如引入独立版本实体，可再做字段解耦

## 下一步建议

1. 汇总 `007A-007D`
   - 将 `TASK_FLOW_REFACTOR_007` 标记为 done
2. 进入下一阶段
   - 让研究流页面/接口开始消费 `execution_feedback`
