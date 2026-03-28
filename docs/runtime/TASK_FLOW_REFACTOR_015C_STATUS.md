# TASK_FLOW_REFACTOR_015C 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:19  
**完成时间**: 2026-03-27 18:22  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

让条件单列表把已存在的策略上下文显示出来，使执行流里能直接看见“这张条件单来自哪个策略”。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/conditional-order.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/conditional-order-render-context.test.js`

## 已完成

- 新增 `formatStrategyContextMeta(order)` helper
- 条件单表格现在会在股票名下方显示策略来源和名称
  - `strategy_config` 显示为“策略库”
  - `template` 显示为“模板”
- helper 同时兼容 snake_case / camelCase 字段
- 已保留现有上下文透传测试，确保渲染补丁不影响创建链路

## 验收结果

- 通过
- 复验命令：
  - `node test/conditional-order-render-context.test.js`
  - `node test/conditional-order-import-context.test.js`
  - `node test/conditional-order-batch-context.test.js`

## 边界情况

- 这一步只做列表展示，不改接口、不改条件单创建逻辑。
- 当前显示的是“来源 + 名称”最小信息；如果后续要展示反馈状态/置信度，应单独再做一轮小任务。

## 下一步建议

1. 做一次浏览器级联调，确认分析页导入后的条件单创建与列表展示都正常
2. 再决定是否把 `feedback` 摘要也展示到条件单页
