# TASK_FLOW_REFACTOR_044B 状态记录

- 记录时间: 2026-03-29 15:45 (Asia/Shanghai)
- 执行人: Codex
- 目标: 修复“条件单从报告导入提示无报告”的主因，让个股分析生成报告后自动可被 `/api/report/list` 和条件单导入链路识别

## 本轮完成

1. 分析报告生成后自动入库
- 文件: `/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js`
- 变更:
  - 新增 `persistStockReport(reportId, payload)`，写入 `stock_analysis_reports`。
  - `POST /api/analyze/report` 成功后，除写 Markdown 外，新增 `report_id` 并落库。
  - 返回体新增字段 `report_id`，便于前端链路追踪。

2. 导入链路兼容字段补齐
- 入库字段包含:
  - `report_id / stock_code / stock_name / report_json`
  - `decision / rating / stop_loss / stop_profit / entry_zone / key_events`
- 决策值标准化:
  - `买入 -> buy`
  - `观望 -> watch`
  - `回避/卖出 -> avoid`

3. 实测验证（本地 API）
- 启动服务后调用:
  - `POST /api/analyze/report` with `stock_code=600050.SH`
- 返回:
  - `success=true`
  - `report_id=ANALYZE_600050.SH_20260329_1774770239166`
- 数据库验证:
  - `stock_analysis_reports` 新增对应记录
  - `GET /api/report/list?stock_code=600050.SH` 可直接返回该报告
- 导入验证:
  - `POST /api/conditional-order/create-from-report`
  - 使用同一 `report_id` 成功创建 `6` 个条件单（止损/止盈/建仓）

## 产出文件

- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_044B_STATUS.md`
