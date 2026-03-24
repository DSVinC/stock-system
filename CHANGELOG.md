# A 股投资系统 - 开发日志

---

## 2026-03-24 | V3.0 阶段 0/1 完成

### ✅ 阶段 0：选股自动化改造（7/7 完成）

**新增 API**:
- `GET /api/industry/score` - 4 维度行业评分
- `GET /api/industry/score/top3` - 行业 Top3 筛选
- `GET /api/industry/:industry/top-stocks` - 行业内个股 7 因子评分
- `GET /api/stock/select/top10` - 全市场个股 Top10 筛选
- `POST /api/minute/fetch` - 分钟线数据获取

**前端改动**:
- `select.html` - 选股 UI 改造（移除手动选择，改为自动推荐）

**数据库迁移**:
- `db/migrations/005_create_analysis_reports_table.sql` - 分析报告表

**验收报告**: `docs/acceptance/TASK_V3_005_ACCEPTANCE.md`

---

### ✅ 阶段 1：回测系统核心框架（4/4 完成）

**新增 API**:
- `POST /api/backtest/run` - 运行回测
- `POST /api/backtest/optimize` - 参数优化
- `GET /api/backtest/history` - 回测历史
- `GET /api/backtest/:id/report` - 回测报告详情

**新增文件**（12 个）:
- `api/backtest-engine.js` - 日线回测引擎（21KB）
- `api/backtest-report.js` - 7 个绩效指标计算（14KB）
- `api/backtest-cache.js` - 缓存机制（11KB）
- `api/optimizer.js` - 贝叶斯优化（19KB）
- `scripts/run_backtest.mjs` - 回测命令行工具
- `scripts/run_optimizer.mjs` - 优化命令行工具
- `test/backtest-report.test.js` - 50 个测试用例
- `db/migrations/006_create_backtest_tables.sql` - 回测表迁移
- `db/migrations/007_create_backtest_cache_table.sql` - 缓存表迁移

**验收报告**: `docs/acceptance/TASK_V3_101_104_ACCEPTANCE.md`

**验收期间修复的 Bug**:
1. 回测引擎 `reset()` 调用时机问题
2. `stock_daily` 表日期格式不匹配
3. `tradeCount` / `totalTrades` 属性名不一致

---

### 📊 总体进度

| 指标 | 数值 |
|------|------|
| V3 总任务 | 21 个 |
| 已完成 | 11 个（52%） |
| 待开始 | 10 个 |
| 预计完成 | 2026-04-28 |
| 实际进度 | 提前约 8 天 |

---

## 2026-03-13 状态（历史归档）

### 已完成

**后端接口**：
- `api/select.js` - 选股接口，返回 6 个方向 + 评分
- `api/analyze.js` - 个股分析接口，返回股票列表
- `api/monitor.js` - 监控池接口（list/add/remove）
- `api/server.js` - Express 服务器入口

**前端页面**：
- `index.html` - 首页
- `analysis.html` - 个股分析页
- `monitor-pool.html` - 监控池管理页
- `pages/style.css` - 暗色主题样式

**数据库**：
- `data/stock_system.db` - SQLite 数据库（通过 /usr/bin/sqlite3）

### 已修复的问题

1. **express 模块引用问题**
   - select.js 和 analyze.js 直接用 `require('express')` 但项目没安装
   - 修复：改用 `createRequire` 引用 sina-ashare-mcp 的 express

2. **路由导出格式问题**
   - server.js 的 mountApi 函数判断顺序错误
   - 修复：先检查 `exported.stack`（Express Router），再检查其他

3. **首页 scrollButton 引用问题**
   - HTML 已删除按钮，但 JS 里还有 scrollButton 变量和事件监听
   - 修复：删除相关代码，添加 viewReportBtn 功能

4. **个股分析页"已选方向"显示问题**
   - 原来显示技术说明文字
   - 修复：直接显示方向名称的 tag

### 待修复问题

1. **前端请求接口失败**
   - 现象：浏览器点击"开始选股"提示"接口请求失败"
   - 接口本身正常（curl 测试通过）
   - 可能原因：浏览器缓存、跨域、或其他前端问题
   - 建议：清浏览器缓存 / 检查 fetch 路径 / 打开浏览器开发者工具看具体错误

2. **查看选股报告功能**
   - 按钮已添加，但后端接口 `/api/select/report` 未实现
   - 需要调用 `skills/a 股行业筛选` 生成报告

3. **查看个股报告功能**
   - 按钮已添加，但后端接口 `/api/analyze/report` 未实现
   - 需要调用 `skills/a 股个股分析` 生成报告

### 启动方式

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node api/server.js
# 访问 http://localhost:3000/index.html
```

### 依赖

- Node.js
- Express（通过 sina-ashare-mcp 的 node_modules）
- SQLite3（系统自带 /usr/bin/sqlite3）

---

*最后更新：2026-03-24 14:30*
