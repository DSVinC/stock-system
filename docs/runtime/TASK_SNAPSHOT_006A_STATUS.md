# TASK_SNAPSHOT_006A 实时状态

**状态**: done  
**开始时间**: 2026-03-27 19:06  
**完成时间**: 2026-03-27 19:11  
**负责人**: Codex（方案/验收/同步）  
**开发执行**: Claude Code + Codex（补齐收口）  

## 任务目标

修复选股历史 API 挂死问题，让 `selection-history.html` 至少能从 `/api/selection/history` 正常拿到 JSON 数据。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/test/selection-history-api.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/api/selection-report.js`

## 已完成

- 已新增历史 API 复现测试，并用超时保护钉住“接口挂死”问题
- `selection-report.js` 已兼容两种调用方式：
  - 供 `select.js` 直接调用的普通函数
  - 供 Express 路由直接挂载的 handler
- `/api/selection/history?limit=3` 现已返回 `success/data` 结构化 JSON
- `/api/selection/report/:id` 也同步补上了 handler 兼容

## 验收结果

- 通过
- 复验命令：
  - `node test/selection-history-api.test.js`
  - `node --check api/selection-report.js`

## 边界情况

- 当前只修复了历史 API 挂死，不代表 `selection-history.html` 的“查看详情”链路已经闭环
- 仓库根目录仍缺少 `selection-report.html` 页面，后续详情查看会是下一步缺口

## 下一步建议

1. 补 `selection-report.html` 或修正历史页详情跳转
2. 将 `TASK_SNAPSHOT_006` 继续拆为：
   - 历史 API 修复 ✅
   - 历史详情页打通
   - 从历史报告导入回测
