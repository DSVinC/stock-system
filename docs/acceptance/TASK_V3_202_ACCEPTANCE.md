# 验收报告 - TASK_V3_202: stock_minute 表设计

**任务状态**: ❌ 未通过
**验收日期**: 2026-03-24
**验收人**: Gemini CLI

---

## 📋 验收清单

| 验收项目 | 状态 | 备注 |
| :--- | :---: | :--- |
| 包含所有必要字段 | ❌ | 必要字段已包含，但部分名称不符合要求：`volume` 被命名为 `vol`；`trade_time` 被拆分为 `trade_date` 和 `trade_time`。 |
| 主键设计合理 | ❌ | 任务要求使用 `(ts_code, trade_time)` 联合主键，交付物使用了 `id` 自增主键。 |
| 索引优化 | ✅ | 包含按时间查询和股票代码查询的索引。 |
| 数据类型正确 | ❌ | 任务要求价格使用 `DECIMAL`，时间使用 `DATETIME`；交付物使用了 `REAL` 和 `TEXT`。 |
| 迁移可重复执行 | ✅ | 使用了 `IF NOT EXISTS`。 |

---

## 🔍 详细说明

在对 `db/migrations/008_create_stock_minute_table.sql` 的审查中发现以下与任务文档 `docs/tasks/TASK_V3_202.md` 的不一致之处：

1. **主键设计违背**: 任务明确要求使用 `(ts_code, trade_time)` 联合主键。这对于分钟线这种海量数据表的查询性能（聚集索引）至关重要。交付物使用了 `id INTEGER PRIMARY KEY AUTOINCREMENT`，这导致时间序列查询需要依赖二级索引，效率较低。
2. **数据类型不一致**: 任务要求使用 `DECIMAL` 以保证金融数据的精度，以及 `DATETIME` 处理时间。交付物使用了 `REAL`（浮点数）和 `TEXT`。虽然项目使用 SQLite，但其他表（如 `database/schema.sql` 中的 `accounts` 表）均遵循了 `DECIMAL` 和 `DATETIME` 的命名规范，应保持一致。
3. **字段命名偏差**: `volume` 字段被命名为 `vol`。虽然这在某些 API 中很常见，但应遵循任务定义的字段规范。
4. **时间字段拆分**: 任务参考 SQL 为单个 `trade_time DATETIME` 字段，交付物将其拆分为 `trade_date` 和 `trade_time` 两个 `TEXT` 字段。虽然这方便了某些查询，但与任务定义不符。

## 🛠️ 建议修复方案

请按照任务文档中的参考 SQL 重新调整表结构：

```sql
CREATE TABLE IF NOT EXISTS stock_minute (
    ts_code VARCHAR(20) NOT NULL,
    trade_time DATETIME NOT NULL,
    open DECIMAL(10,4),
    high DECIMAL(10,4),
    low DECIMAL(10,4),
    close DECIMAL(10,4),
    volume BIGINT,
    amount DECIMAL(20,4),
    PRIMARY KEY (ts_code, trade_time)
);

CREATE INDEX IF NOT EXISTS idx_minute_time ON stock_minute(trade_time);
CREATE INDEX IF NOT EXISTS idx_minute_code ON stock_minute(ts_code);
```

待修复后重新提交验收。
