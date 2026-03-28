# TASK_FLOW_REFACTOR_017B 实时状态

**状态**: done  
**开始时间**: 2026-03-27 19:01  
**完成时间**: 2026-03-27 19:03  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（测试固化）  

## 任务目标

把“分析页 -> 监控池”执行流前半段也固化成正式浏览器回归，确保分析页显示策略上下文且能把选中股票带着策略身份送进监控池。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/test/analysis-to-monitor-browser-smoke.test.js`

## 已完成

- 已新增 Playwright 浏览器回归脚本
- 脚本覆盖：
  - 预置 `analysisResults / stockSelectConfig`
  - 分析页显示策略上下文 banner
  - 点击“加入监控池”
  - 监控池页面显示股票、策略来源和策略名称

## 验收结果

- 通过
- 复验命令：
  - `node test/analysis-to-monitor-browser-smoke.test.js`

## 边界情况

- 该脚本依赖本地服务已启动在 `http://127.0.0.1:3000`
- 使用测试股票 `222222.SZ`，运行前会先尝试从监控池移除

## 下一步建议

1. 合并成完整执行流 smoke：
   - 分析页 -> 监控池 -> 条件单
2. 后续把这条完整 smoke 纳入固定回归集
