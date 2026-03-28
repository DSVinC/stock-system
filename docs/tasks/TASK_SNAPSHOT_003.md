# TASK_SNAPSHOT_003: 创建 stock_selection_reports 表

已基于真实数据库、迁移脚本、回填脚本证据确认完成；详细证据见 docs/runtime/TASK_SNAPSHOT_001-005_STATUS.md。

**任务 ID**: TASK_SNAPSHOT_003  
**任务名称**: 创建选股报告存储表  
**优先级**: P0  
**创建时间**: 2026-03-24  
**预计工作量**: 0.5 天  
**状态**: 已完成（done）

---

## 📋 任务描述

创建 `stock_selection_reports` 表，用于存储选股阶段产生的报告，支持回测追溯和调仓对比。

---

## 🎯 验收标准

| 标准 | 目标值 | 验证方法 |
|------|--------|---------|
| 表结构完整 | 包含所有必需字段 | SQL 检查 |
| 索引创建 | trade_date + created_at 索引 | SQL 检查 |
| JSON 字段 | 支持 JSON 存储和查询 | 测试插入 |
| 测试插入 | 可正常插入和查询 | 运行测试脚本 |

---

## 📊 表结构设计

```sql
-- 选股报告存储表
CREATE TABLE IF NOT EXISTS stock_selection_reports (
    report_id TEXT PRIMARY KEY,          -- 报告 ID (SELECT_20260324_091500)
    report_type TEXT NOT NULL,           -- 报告类型 (stock_selection)
    created_at TEXT NOT NULL,            -- 创建时间
    trade_date TEXT NOT NULL,            -- 交易日期
    filter_config TEXT NOT NULL,         -- 筛选配置 (JSON)
    selected_stocks TEXT NOT NULL,       -- 选股结果 (JSON)
    statistics TEXT,                     -- 统计信息 (JSON)
    data_snapshot TEXT,                  -- 数据快照 (JSON)
    created_by TEXT DEFAULT 'system'     -- 创建者
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_trade_date ON stock_selection_reports(trade_date);
CREATE INDEX IF NOT EXISTS idx_created_at ON stock_selection_reports(created_at);
```

---

## 🔧 实现步骤

### 步骤 1: 创建 SQL 脚本

**文件**: `stock-system/db/migrations/003_create_selection_reports_table.sql`

```sql
-- 选股报告存储表
-- 创建时间：2026-03-24
-- 用途：存储选股阶段产生的报告，支持回测追溯和调仓对比

-- 删除旧表（如有）
DROP TABLE IF EXISTS stock_selection_reports;

-- 创建表
CREATE TABLE stock_selection_reports (
    report_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    filter_config TEXT NOT NULL,
    selected_stocks TEXT NOT NULL,
    statistics TEXT,
    data_snapshot TEXT,
    created_by TEXT DEFAULT 'system'
);

-- 创建索引
CREATE INDEX idx_trade_date ON stock_selection_reports(trade_date);
CREATE INDEX idx_created_at ON stock_selection_reports(created_at);

-- 插入示例数据
INSERT INTO stock_selection_reports VALUES
(
    'SELECT_20260324_091500',
    'stock_selection',
    '2026-03-24T09:15:00+08:00',
    '2026-03-24',
    '{"industry_weights": {"policy": 0.25, "commercialization": 0.30, "sentiment": 0.25, "capital": 0.20}, "seven_factor_min_score": 0.75, "valuation_limits": {"pe_max": 60, "peg_max": 2.0}, "price_limit": {"max_price": 150}, "industry_filter": ["白酒", "人工智能", "CPO"]}',
    '[{"rank": 1, "ts_code": "000858.SZ", "name": "五粮液", "industry": "白酒", "total_score": 8.2}, {"rank": 2, "ts_code": "000568.SZ", "name": "泸州老窖", "industry": "白酒", "total_score": 7.9}, {"rank": 3, "ts_code": "300308.SZ", "name": "中际旭创", "industry": "CPO", "total_score": 8.5}]',
    '{"total_candidates": 5000, "passed_industry_filter": 387, "passed_seven_factor": 156, "final_selected": 10}',
    '{"trade_date": "2026-03-24", "data_source": "Tushare + 新浪财经"}',
    'system'
);
```

### 步骤 2: 执行迁移

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db < db/migrations/003_create_selection_reports_table.sql
```

### 步骤 3: 验证表结构

```bash
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db <<EOF
-- 检查表是否存在
SELECT name FROM sqlite_master WHERE type='table' AND name='stock_selection_reports';

-- 检查表结构
PRAGMA table_info(stock_selection_reports);

-- 检查索引
SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='stock_selection_reports';

-- 检查示例数据
SELECT COUNT(*) FROM stock_selection_reports;

-- 测试查询 JSON 字段
SELECT 
    report_id,
    trade_date,
    json_extract(filter_config, '$.industry_filter') as industries,
    json_extract(selected_stocks, '$[0].name') as top1_stock
FROM stock_selection_reports;

-- 测试按日期查询
SELECT report_id, trade_date, json_extract(selected_stocks, '$[0].name') as top1_stock
FROM stock_selection_reports
WHERE trade_date = '2026-03-24';
EOF
```

---

## 📝 交付清单

- [ ] 创建 SQL 迁移脚本 `db/migrations/003_create_selection_reports_table.sql`
- [ ] 执行迁移，创建表
- [ ] 验证表结构（字段、索引）
- [ ] 插入示例数据
- [ ] 测试 JSON 字段查询
- [ ] 生成交接文档

---

## 📚 关联文档

- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.1 节
- 关联任务：TASK_SNAPSHOT_001 (stock_factor_snapshot 表), TASK_SNAPSHOT_002 (policy_events 表)

---

_创建时间：2026-03-24_
