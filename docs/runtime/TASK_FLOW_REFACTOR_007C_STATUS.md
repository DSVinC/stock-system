# TASK_FLOW_REFACTOR_007C 实时状态

**状态**: done  
**开始时间**: 2026-03-27 14:10  
**完成时间**: 2026-03-27 15:01  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code（主修复） + Codex（回归收口/验收）  

## 任务目标

在“条件已触发但未成交”的场景下，写入 `execution_feedback.event_type = conditional_trigger`，为研究流保留失败触发反馈。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/conditional-executor.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-trigger-feedback.test.js`

## 先复现的问题

- 条件触发但因资金不足/持仓不足等原因执行失败时，没有任何反馈沉淀

## 已完成

- 新增复现测试，验证：
  - 资金不足场景会写 `conditional_trigger`
  - `payload_json` 包含：
    - `code`
    - `error`
    - `stage = post_trigger_pre_trade`
- 执行器已只在 `post-trigger pre-trade` 失败时写反馈
- 兼容性收口：
  - 若旧环境缺少 `conditional_order_context / execution_feedback` 表，反馈写入会安全降级，不影响原执行逻辑

## 验收结果

- 通过
- 复验命令：
  - `node --check api/conditional-executor.js`
  - `node test/conditional-trigger-feedback.test.js`
  - `node test/conditional-execution-feedback.test.js`
  - `node test/conditional-executor-check.js`

## 边界情况

- 本轮只处理“条件已触发，但成交前失败”
- `停牌 / 无行情 / 条件未触发` 仍不写反馈
- 当前失败反馈不计算 `realized_pnl / holding_days`

## 下一步建议

1. `TASK_FLOW_REFACTOR_007D`
   - 仓位关闭时写 `position_closed`
