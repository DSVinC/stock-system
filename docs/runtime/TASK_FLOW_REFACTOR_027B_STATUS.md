# TASK_FLOW_REFACTOR_027B 实时状态

**状态**: done  
**开始时间**: 2026-03-28 07:41  
**完成时间**: 2026-03-28 07:44  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent

## 任务目标

给 `iteration-manager.html` 增加“优化后端”选择器，让研究流页面可以在默认 `heuristic` 与可选 `optuna` 之间切换，并把该值写入启动请求体。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/iteration-manager-optimization-backend-request.test.js`

## 已完成

- 页面新增“优化后端”选择器：
  - `heuristic（默认快速模式）`
  - `optuna（真实优化模式）`
- `startIteration()` 现在会把 `optimizationBackend` 一起发给 `/api/iteration/start`
- 未选择时仍默认提交 `heuristic`
- 新增页面请求体回归测试，覆盖默认值与显式 `optuna`

## 验收结果

- 通过
- 复验命令：
  - `node /Users/vvc/.openclaw/workspace/stock-system/test/iteration-manager-optimization-backend-request.test.js`

## 边界情况

- 本轮只补了页面选择器和请求体，尚未做浏览器级联动验收
- `node --check` 不能直接检查 `.html`，因此页面语法仍以现有回归和后续浏览器验收为准

## 下一步建议

1. 补一条浏览器级回归，确认页面切到 `optuna` 后真实请求和 UI 状态都正常
2. 后续再考虑根据后端不同，增加耗时/模式提示文案

