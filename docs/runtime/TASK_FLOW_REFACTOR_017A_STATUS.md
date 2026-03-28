# TASK_FLOW_REFACTOR_017A 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:58  
**完成时间**: 2026-03-27 19:00  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

让分析页也能直接显示当前策略上下文，避免执行流用户在分析阶段丢失“这次分析基于哪条策略”的心智。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/analysis.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/analysis-strategy-context-banner.test.js`

## 已完成

- 分析页已新增轻量 `strategy-context-banner`
- 当 `stockSelectConfig` 存在时，页面会显示：
  - 来源标签（策略库 / 模板）
  - 当前策略名称
- 没有有效上下文时会自动隐藏，不影响原有分析流程

## 验收结果

- 通过
- 复验命令：
  - `node test/analysis-strategy-context-banner.test.js`
  - `node test/analysis-monitor-draft-context.test.js`

## 边界情况

- 这一步只做“显示”，没有在分析页加新的交互入口。
- 当前 banner 读取的是 `stockSelectConfig`，如果来源不是选股页导入，可能为空，这是当前预期。

## 下一步建议

1. 做一条更完整的执行流浏览器回归：
   - 选股/分析页显示策略上下文
   - 加入监控池
   - 监控池显示来源
   - 批量创建条件单成功
