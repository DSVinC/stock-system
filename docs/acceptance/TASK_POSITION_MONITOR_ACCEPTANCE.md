# TASK_POSITION_MONITOR 验收报告

**任务 ID**: TASK_POSITION_MONITOR  
**验收时间**: 2026-03-23  
**验收员**: Gemini CLI

---

## 📋 验收标准核查

| 验收项 | 状态 | 说明 |
| :--- | :---: | :--- |
| **1. position_signals 数据库表创建成功** | ✅ | 表结构已创建，包含索引，位于 `stock_system.db` |
| **2. 信号生成模块 (api/position-signals.js)** | ✅ | 阈值实现正确 (30%/15%/3条)，逻辑严密 |
| **3. 持仓监控脚本 (scripts/monitor-positions.mjs)** | ✅ | 支持多种模式，集成飞书推送，逻辑完整 |
| **4. UI 标签页展示信号历史** | ✅ | `portfolio.html` 已新增"持仓监控"标签页，支持异步加载和筛选 |

---

## 🔍 详细验证过程

### 1. 数据库验证
通过 `sqlite3` 验证表结构：
```sql
CREATE TABLE position_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  ts_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  signal_level TEXT NOT NULL,
  reason TEXT NOT NULL,
  ...
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read INTEGER DEFAULT 0
);
```
验证数据：目前表中已有 4 条测试/真实信号。

### 2. 逻辑验证
`api/position-signals.js` 准确实现了以下规则：
- **7 因子评分下降 > 30%**: `SELL` / `HIGH`
- **7 因子评分下降 > 15%**: `WARNING` / `MEDIUM`
- **负面新闻 ≥ 3 条**: `SELL` / `HIGH`
- **黑天鹅事件**: `SELL` / `HIGH`

### 3. 脚本验证
`scripts/monitor-positions.mjs` 具备完整的执行流程：
- 获取持仓 -> 运行监控 -> 生成信号 -> 飞书推送。
- 支持 `--mode=morning/daily/intraday`。

### 4. UI 验证
`portfolio.html` 新增了：
- `monitor-panel` 容器
- 监控概览数据（持仓数、今日信号、高风险数）
- 信号列表渲染逻辑（含 `SELL`、`WARNING` 标识）
- "立即检查"功能对接 `POST /api/monitor/run`

---

## 📝 验收结论

**通过**

该功能完整实现了持仓股票的自动化监控与闭环告警，数据库、后端逻辑、定时脚本及前端 UI 均符合任务书要求。
