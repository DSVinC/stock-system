# TASK_SNAPSHOT_006C2 实时状态

**状态**: done  
**开始时间**: 2026-03-27 19:18  
**完成时间**: 2026-03-27 19:20  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Codex（历史页按钮接线）  

## 任务目标

让 `selection-history.html` 的“导入回测”按钮真正接到已打通的历史报告导入能力上。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/test/selection-history-import-backtest.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/selection-history.html`

## 已完成

- 已新增历史页导入回测浏览器测试
- “导入回测”按钮已改为跳转：
  - `./backtest.html?import=selection-report&id=<report_id>`
- 点击后可直接进入回测页并自动带入历史报告中的股票列表

## 验收结果

- 通过
- 复验命令：
  - `node test/selection-history-import-backtest.test.js`

## 边界情况

- 当前导入的是历史报告里的股票列表，不自动恢复更细粒度的研究参数
- 如果后续要把历史筛选参数也带入回测配置，需要新增独立任务处理

## 下一步建议

1. 将 `TASK_SNAPSHOT_006` 主任务标记为完成
2. 后续如需增强，可单独补“历史报告筛选参数导入回测配置”
