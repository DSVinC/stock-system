# TASK_FLOW_REFACTOR_006C2C3 实时状态

**状态**: done  
**开始时间**: 2026-03-27 13:46  
**完成时间**: 2026-03-27 13:50  
**负责人**: Codex（派单/实现/验收）  
**开发执行**: Codex（先复现测试，再统一修旧写法）  

## 任务目标

修复 `api/conditional-order.js#createFromReport()` 的旧写法，让“从分析报告创建条件单”不再把 `report_id` 写进主表，并统一改写 `conditional_order_context`。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/conditional-order.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-create-from-report-context.test.js`

## 先复现的问题

- 旧实现直接 `require('./db')` 并调用 `db.getPromise / db.runPromise`
- 主表 SQL 仍在引用 `report_id`
- `entry` 条件单的旧 SQL 还带着一处参数/列定义不一致风险

## 已完成

- 新增复现测试，明确：
  - 主表不应再写 `report_id`
  - 每个从报告创建出的条件单都应写一条上下文侧表
- `createFromReport()` 已统一改为：
  - 使用真实 `getDatabase()`
  - 主表只写真实 schema 字段
  - 每个新建条件单都写入 `conditional_order_context`
  - 统一记录：
    - `strategy_source = analysis_report`
    - `strategy_config_name = 从分析报告导入: {report_id}`
    - `report_id`

## 验收结果

- 通过
- 复验命令：
  - `node --check api/conditional-order.js`
  - `node test/conditional-order-create-from-report-context.test.js`

## 边界情况

- 当前侧表仍然把“导入说明”复用在 `strategy_config_name`
- 这一步只对齐了报告导入路径，不包含页面展示层对这些上下文的消费

## 下一步建议

1. 将 `TASK_FLOW_REFACTOR_006C2` 标记为 done
2. 进入“执行反馈 -> 研究流回流”的下一阶段设计/任务拆分
