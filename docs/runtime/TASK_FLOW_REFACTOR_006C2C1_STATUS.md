# TASK_FLOW_REFACTOR_006C2C1 实时状态

**状态**: done  
**开始时间**: 2026-03-27 13:30  
**完成时间**: 2026-03-27 13:36  
**负责人**: Codex（派单/实现/验收）  
**开发执行**: Codex（本轮先做复现测试，再补最小修复）  

## 任务目标

修复 `api/report-storage.js#importToOrderFromReport()` 对 `conditional_order` 主表旧列的错误依赖，让“从分析报告导入条件单”这条写入路径与 `conditional_order_context` 侧表方案对齐。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/report-storage.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/report-storage-import-schema.test.js`

## 先复现的问题

- 导入路径原本执行：
  - `INSERT INTO conditional_order (..., start_date, remark)`
- 但真实主表 schema 不包含：
  - `remark`
- 同时主表还要求：
  - `end_date`
  - `created_at`
  - `updated_at`

## 已完成

- 新增复现测试，先钉住旧实现错误依赖 `remark` 列
- `importToOrderFromReport()` 已改为：
  - 主表只写现有 schema 字段
  - 默认补齐 `end_date`（3 个月后）
  - `report_id` 与“从报告导入”的说明改写入 `conditional_order_context`
- 回归测试已升级为修复验证：
  - 不再写 `remark`
  - 会写入侧表上下文

## 验收结果

- 通过
- 复验命令：
  - `node --check api/report-storage.js`
  - `node test/report-storage-import-schema.test.js`

## 边界情况

- 本轮只修了 `report-storage#importToOrderFromReport()` 这一路径
- 旧的 `api/conditional-order.js#createFromReport()` 仍然还在写 `report_id` 到主表，属于后续子任务
- 本轮侧表里暂时把导入说明放在 `strategy_config_name`，后续如果要单独区分“来源备注”和“策略名称”，再单独扩字段

## 下一步建议

1. `TASK_FLOW_REFACTOR_006C2C2`
   - 对齐 `api/backtest-to-conditional.js`
2. `TASK_FLOW_REFACTOR_006C2C3`
   - 修 `api/conditional-order.js#createFromReport()` 旧写法
