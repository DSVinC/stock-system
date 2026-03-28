# TASK_FLOW_REFACTOR_019B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 20:36  
**完成时间**: 2026-03-27 20:45  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent（实现） + Codex（独立验收）  

## 任务目标

让迭代任务 API 在创建和查询状态时都带出输入摘要，保证前端能拿到 `stocks/startDate/endDate/config/parallelTasks` 的真实上下文。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/iteration-manager.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/iteration-manager-input-summary.test.js`

## 已完成

- `POST /api/iteration/start` 现在会把研究输入整理到 `task.inputSummary`
- `GET /api/iteration/status/:taskId` 现在返回：
  - `task.inputSummary.stocks`
  - `task.inputSummary.startDate`
  - `task.inputSummary.endDate`
  - `task.inputSummary.config`
  - `task.inputSummary.parallelTasks`
- 对旧任务补了兼容兜底：
  - 如果历史任务没有 `inputSummary`，状态接口会用现有字段拼出同结构摘要
  - `parallelTasks` 缺失时回 `null`

## 验收结果

- 通过
- 复验命令：
  - `node --check api/iteration-manager.js`
  - `node test/iteration-manager-input-summary.test.js`

## 边界情况

- 当前摘要仍只保存在内存任务对象里，服务重启后不会保留。
- 这一步解决的是“状态可解释”，还没有解决“刷新后任务可恢复”。

## 下一步建议

1. 做最小任务快照持久化
2. 前端消费 `inputSummary`，让运行中的任务也能回显真实输入
