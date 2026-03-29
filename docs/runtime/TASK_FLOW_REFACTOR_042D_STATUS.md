# TASK_FLOW_REFACTOR_042D 状态记录

## 任务
修复个股分析页两类“假现象”：

- 所有个股推荐评分 / 决策建议被伪装成 `6.0/10 + 观望`
- 点击任意个股“查看报告”都打开同一天的 `隆基绿能` 报告

## 根因

### 1. 分析失败被伪装成正常结果
- `/api/analyze` 内部调用 Python 个股分析器
- 本机 Python 环境缺 `tushare`
- 旧逻辑在分析失败后回退成固定 `score = 6`、`decision = 观望`

### 2. 报告历史接口没有按股票代码隔离
- `/api/analysis/reports/:ts_code` 旧逻辑直接返回全部报告
- `analysis.html` 发现“今天已有报告”后就直接打开
- 于是所有股票都可能打开同一天任意一份历史报告，实际观感就是都串到 `隆基绿能`

## 修复

### `/Users/vvc/.openclaw/workspace/stock-system/api/analyze.js`
- `analyzeStockWithCache` 在 Python 依赖缺失时，改为调用 `buildFallbackPayload(stockCode)`
- 不再把失败伪装成 `6 分 / 观望`
- 若后备分析也失败，直接从候选列表中过滤，不返回假正常股票卡片

### `/Users/vvc/.openclaw/workspace/stock-system/api/analysis.js`
- 新生成的 HTML 报告文件名增加 `ts_code`
  - 例如：`stock_report_法拉电子_600563_SH_20260328.html`
- `GET /api/analysis/reports/:ts_code` 增加按 `ts_code` 过滤
- 兼容旧报告：若文件名中没有 `ts_code`，则回读 HTML 内容确认归属

### 新增回归测试
- `/Users/vvc/.openclaw/workspace/stock-system/test/analysis-report-isolation-regression.test.js`

## 验收证据

### 静态回归测试
- `node test/analysis-report-isolation-regression.test.js` 通过

### API 验收
- 分析候选股恢复分化：
  - `绿色电力 + 特高压` 样本返回 `10` 只股票
  - 示例：
    - `法拉电子 600563.SH -> 6.27 / 回避`
    - `隆基绿能 601012.SH -> 5.97 / 回避`
    - `远东股份 600869.SH -> 5.83 / 回避`
- 报告隔离恢复：
  - `600563.SH` 的历史报告列表不再混入 `隆基绿能`
  - `601012.SH` 仍能拿到自身报告

### 浏览器验收
- `/Users/vvc/.openclaw/workspace/stock-system/temp/analysis-fix-report.json`
  - 页面前 5 张卡片已出现不同股票、不同评分，不再统一 `6.0 / 观望`
- `/Users/vvc/.openclaw/workspace/stock-system/temp/screenshots/analysis-fix/analysis-cards.png`
- 点击首张卡“查看报告”弹窗：
  - URL：`/report/analysis/stock_report_法拉电子_600563_SH_20260328.html`
  - 标题：`法拉电子 个股分析报告`

## 结论
- 个股分析评分/建议假统一：已修复
- 个股报告串号为同一份历史报告：已修复
