# TASK_FLOW_REFACTOR_006C2C2 实时状态

**状态**: done  
**开始时间**: 2026-03-27 13:41  
**完成时间**: 2026-03-27 13:44  
**负责人**: Codex（派单/实现/验收）  
**开发执行**: Codex（先复现测试，再做最小修复）  

## 任务目标

让 `api/backtest-to-conditional.js#createConditionalOrderInDB()` 在回测导入条件单时，同步写入 `conditional_order_context`，保留研究流来源信息。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/backtest-to-conditional.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/backtest-conditional-context.test.js`

## 先复现的问题

- 回测导入路径当前只写 `conditional_order` 主表
- 研究流来源字段：
  - `source`
  - `reason`
  尚未进入 `conditional_order_context`

## 已完成

- 新增复现测试，先确认当前不会写侧表
- `createConditionalOrderInDB()` 已在主表创建成功后补写侧表：
  - `strategy_source = source`
  - `strategy_config_name = reason`
- 修复验证测试通过

## 验收结果

- 通过
- 复验命令：
  - `node --check api/backtest-to-conditional.js`
  - `node test/backtest-conditional-context.test.js`

## 边界情况

- 本轮只保留研究流来源信息，未额外补 `strategy_id / strategy_version`
- 当前 `reason` 暂时复用到 `strategy_config_name` 字段，用来保留回测导入原因说明

## 下一步建议

1. `TASK_FLOW_REFACTOR_006C2C3`
   - 修 `api/conditional-order.js#createFromReport()` 的旧 `report_id` 主表写法
