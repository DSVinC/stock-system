# TASK_FLOW_REFACTOR_016D 实时状态

**状态**: done  
**开始时间**: 2026-03-27 18:56  
**完成时间**: 2026-03-27 18:57  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（测试固化）  

## 任务目标

把“监控池 -> 条件单”浏览器级运行态验证固化成正式回归脚本，避免未来再次出现页面能跳转但实际落不了单的问题。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/test/monitor-to-conditional-browser-smoke.test.js`

## 已完成

- 已新增 Playwright 浏览器冒烟脚本
- 脚本覆盖：
  - 监控池写入测试股票
  - 页面勾选股票并进入批量创建
  - 填写最小条件和仓位
  - 验证条件单成功创建
  - 验证新条件单保留 `strategy_source / strategy_config_id / template_id`

## 验收结果

- 通过
- 复验命令：
  - `node test/monitor-to-conditional-browser-smoke.test.js`

## 边界情况

- 该脚本依赖本地服务已启动在 `http://127.0.0.1:3000`
- 使用固定测试股票 `111111.SZ`，运行前会先尝试从监控池移除

## 下一步建议

1. 按同样思路补 `analysis -> monitor-pool` 浏览器回归
2. 逐步把执行流关键跳转都固化成一条轻量浏览器 smoke
