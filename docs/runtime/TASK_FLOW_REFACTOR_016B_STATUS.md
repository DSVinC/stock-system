# TASK_FLOW_REFACTOR_016B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:48  
**完成时间**: 2026-03-27 18:50  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

让监控池页面真正显示策略上下文，执行流中间节点也能看见“这只股票来自哪个策略来源”。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/monitor-pool.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/monitor-pool-render-context.test.js`

## 已完成

- 监控池列表股票名下方已显示：
  - `策略库` / `模板` 来源标签
  - 对应策略名称或模板名称
- 渲染时兼容 snake_case / camelCase 字段
- 复选框 dataset 也同步补齐这些字段，后续批量导入条件单继续可用

## 验收结果

- 通过
- 复验命令：
  - `node test/monitor-pool-render-context.test.js`
  - `node test/monitor-pool-context.test.js`
  - `node test/monitor-pool-api-context.test.js`

## 边界情况

- 这一步只显示策略身份，没有把 feedback 快照也显示到监控池列表。
- 当前使用轻量标签，不做额外详情卡片，避免监控池页面过载。

## 下一步建议

1. 做一次浏览器冒烟：
   - 分析页加入监控池
   - 监控池显示策略来源
   - 批量创建条件单继续带策略上下文
2. 如链路稳定，再决定是否给监控池补 feedback 标签
