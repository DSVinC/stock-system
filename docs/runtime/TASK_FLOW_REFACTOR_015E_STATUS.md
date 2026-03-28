# TASK_FLOW_REFACTOR_015E 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:28  
**完成时间**: 2026-03-27 18:31  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

修复 `analysis.html` 在后端策略接口不可用时整条“导入条件单”链路被 token 依赖卡死的问题。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/analysis.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/analysis-import-conditional-fallback.test.js`

## 已完成

- 已新增复现测试，确认当 `/api/v2/analyze/strategy/...` 返回失败时，分析页会直接 alert 中断
- `importToConditional()` 现在支持双通道：
  - 优先使用后端策略接口
  - 接口失败时，回退到当前页面已有的 `stockV2Data`
- 本地回退仍会附带 `stockSelectConfig` 中的策略身份字段

## 验收结果

- 通过
- 复验命令：
  - `node test/analysis-import-conditional-fallback.test.js`

## 边界情况

- 这一步前提是当前页面已经有 `stockV2Data`；如果页面根本没有 v2 数据且后端接口也失败，仍会 alert。
- 这一步修的是前端回退，不改变后端分析 API。

## 下一步建议

1. 做一次更完整的浏览器级联调：
   - 分析页已有 v2 数据
   - 点击“导入条件单”
   - 条件单页导入、创建、列表展示整段成功
2. 再判断是否要在分析页 UI 上提示“当前使用本地策略回退”
