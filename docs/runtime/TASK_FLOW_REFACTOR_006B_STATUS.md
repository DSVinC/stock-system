# TASK_FLOW_REFACTOR_006B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 12:53  
**完成时间**: 2026-03-27 12:58  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code（`glm-5`）  
**审查辅助**: Gemini CLI（本轮未调用）  

## 任务目标

让 `monitor-pool.html` 在读取分析页草稿和组装批量创建参数时，保留执行流程中的策略身份字段，不再在监控池页面把这些上下文裁掉。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/monitor-pool.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/monitor-pool-context.test.js`

## 已完成

- 新增 `test/monitor-pool-context.test.js`
- 先确认失败：`readDraftStocks()` / `getSelectedStocks()` 未保留策略身份字段
- `normalizeDraftStock()` 现在会保留：
  - `strategySource`
  - `strategyConfigId`
  - `strategyConfigName`
  - `templateId`
  - `templateName`
- `getSelectedStocks()` 现在会从 checkbox dataset 继续带上这些字段
- 手动回退了 Claude 一处越界的导航改动，保持任务边界干净

## 验收结果

- 通过
- 复现命令：
  - `node test/monitor-pool-context.test.js`（修复前失败）
- 复验命令：
  - `node test/monitor-pool-context.test.js`
  - `sed -n '176,236p' monitor-pool.html`
  - `sed -n '544,584p' monitor-pool.html`

## 边界情况

- 本轮只打通到“monitor-pool 组 batch 参数”这一步，还没有让 `conditional-order.html` 实际消费这些字段
- `monitor_pool` 数据库表本身还没有存储这些上下文，本轮只处理前端页面间传递
- Claude 本轮有一次越界改导航，已在验收前手动回退

## 下一步建议

1. `TASK_FLOW_REFACTOR_006C`
   - 让 `conditional-order.html` 解析并消费 batch 参数中的策略身份字段
2. `TASK_FLOW_REFACTOR_007`
   - 设计执行反馈回流到策略管理
