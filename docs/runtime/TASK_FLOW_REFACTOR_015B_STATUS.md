# TASK_FLOW_REFACTOR_015B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:16  
**完成时间**: 2026-03-27 18:18  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（最小补丁收口）  

## 任务目标

修复 `analysis.html -> conditional-order.html?import=...` 的上游导入载荷，让分析页在跳转条件单页时把当前策略身份一起带上。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/analysis.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/analysis-conditional-import-context.test.js`

## 已完成

- 已新增复现测试，先确认分析页导入条件单时未透传策略身份字段
- `analysis.html#importToConditional()` 现在会读取 `localStorage.stockSelectConfig`
- 跳转 `conditional-order.html?import=...` 前，会把以下字段并入导入载荷：
  - `strategySource`
  - `strategyConfigId`
  - `strategyConfigName`
  - `templateId`
  - `templateName`
- 已与下游回归一起通过，保证“分析页带出 -> 条件单页透传”前后链路一致

## 验收结果

- 通过
- 复验命令：
  - `node test/analysis-conditional-import-context.test.js`
  - `node test/conditional-order-import-context.test.js`

## 边界情况

- 这一步只修复“分析页跳条件单页”的导入载荷，不涉及后端分析 API 本身。
- 真实运行时 `/api/v2/analyze/strategy/:tsCode/:riskType` 在当前环境还受 `TUSHARE_TOKEN` 影响；所以这一步先用页面级测试保证上下文字段拼装正确。

## 下一步建议

1. 做一次浏览器级联调：
   - 分析页点击“导入条件单”
   - 条件单页完成导入
   - 创建请求确认带有完整策略身份
2. 再决定是否需要让后端分析 API 直接返回这些字段
