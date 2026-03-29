# TASK_FLOW_REFACTOR_042K 状态记录

## 任务
修复条件单页面“从分析报告导入”无法找到报告的问题。

## 完成时间
2026-03-28 19:16

## 问题现象
- 在 `conditional-order.html` 新建条件单弹窗中
- 选择监控池股票后，“从分析报告导入”区域下拉框显示：
  - `未找到该股票报告`
- 即使磁盘中已存在对应 HTML 报告文件，也无法导入

## 根因
- 条件单页使用 `/api/report/list?stock_code=...` 加载报告列表
- 该接口只查询 `stock_analysis_reports` 数据表
- 当前数据库中的 `stock_analysis_reports` 为空
- 但 `../report/analysis/` 目录中已存在实际生成的 HTML 报告文件
- 导致“页面有报告文件，接口却返回空列表”的割裂

## 修复内容
- 更新 `api/report-storage.js`
- 为 `/api/report/list` 增加文件系统回退逻辑：
  - 当数据库中查不到指定 `stock_code` 的报告时
  - 自动扫描 `report/analysis/` 目录
  - 按文件名中的股票代码 token（如 `600050_SH`）匹配报告文件
  - 以文件名作为 `report_id`、文件修改时间作为 `created_at` 返回

## 验收结果

### 接口验收
- `GET /api/report/list?stock_code=600050.SH`
- 返回：
  - `success = true`
  - `reports.length = 1`
  - `source = filesystem_fallback`

### 浏览器验收
- 打开 `conditional-order.html`
- 点击“+ 新建条件单”
- 选择股票 `中国电信 (601728.SH)`
- 报告下拉框成功显示：
  - `2026-03-28 - stock_report_中国电信_601728_SH_20260328`
- “导入选定报告策略”按钮可用

## 结论
条件单页面“从分析报告导入”已恢复可用，不再依赖报告必须先落库。
