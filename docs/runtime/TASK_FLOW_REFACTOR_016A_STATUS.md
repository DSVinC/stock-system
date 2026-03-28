# TASK_FLOW_REFACTOR_016A 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:44  
**完成时间**: 2026-03-27 18:47  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

让监控池真正持久化并返回策略上下文，不再停留在“前端能传、后端没落库”的状态。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/monitor-pool.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/monitor-pool-api-context.test.js`

## 已完成

- 已新增 `monitor_pool_context` side table 的最小建表逻辑
- `POST /api/monitor-pool/add` 现在会在有策略上下文时写入：
  - `strategy_source`
  - `strategy_config_id`
  - `strategy_config_name`
  - `template_id`
  - `template_name`
- `GET /api/monitor-pool/list` 现在会联表返回这些字段

## 验收结果

- 通过
- 复验命令：
  - `node test/monitor-pool-api-context.test.js`
  - `node --check api/monitor-pool.js`
  - `node test/monitor-pool-context.test.js`

## 边界情况

- 这一步只完成后端持久化和查询透传，监控池页面还没有把这些字段渲染出来。
- 当前 `monitor_pool_context` 只存最小策略身份，没有扩到 feedback 快照。

## 下一步建议

1. 继续做 `016B`：
   - `monitor-pool.html` 列表显示策略来源与策略名称
2. 后续如果需要执行反馈，也沿 side table 思路追加，不污染主表
