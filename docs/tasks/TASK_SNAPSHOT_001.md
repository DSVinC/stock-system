# TASK_SNAPSHOT_001: 创建 stock_factor_snapshot 表

已基于真实数据库、迁移脚本、回填脚本证据确认完成；详细证据见 docs/runtime/TASK_SNAPSHOT_001-005_STATUS.md。

**任务 ID**: TASK_SNAPSHOT_001  
**任务名称**: 创建选股因子历史快照表  
**优先级**: P0  
**创建时间**: 2026-03-24  
**预计工作量**: 0.5 天  
**状态**: 已完成（done）

---

## 📋 任务描述

创建 `stock_factor_snapshot` 表，用于存储每日选股因子的历史快照，支持回测系统的历史数据查询。

---

## 🎯 验收标准

| 标准 | 目标值 | 验证方法 |
|------|--------|---------|
| 表结构完整 | 包含所有必需字段 | SQL 检查 |
| 索引创建 | trade_date + ts_code 索引 | SQL 检查 |
| 测试插入 | 可正常插入和查询 | 运行测试脚本 |

---

## 📊 表结构设计

```sql
-- 选股因子历史快照表
CREATE TABLE IF NOT EXISTS stock_factor_snapshot (
    trade_date TEXT NOT NULL,        -- 快照日期 (YYYY-MM-DD)
    ts_code TEXT NOT NULL,           -- 股票代码 (000858.SZ)
    industry TEXT,                   -- 行业 (白酒、AI 等)
    
    -- 4 维度行业筛选因子
    policy_score REAL,               -- 政策支持评分 (0-10)
    commercialization_score REAL,    -- 商业化显现评分 (0-10)
    sentiment_score REAL,            -- 舆论热度/市场关注度 (0-10)
    capital_score REAL,              -- 资本认可评分 (0-10)
    
    -- 7 因子个股评分因子
    roe REAL,                        -- ROE（最新财报）
    revenue_growth REAL,             -- 营收增速
    netprofit_growth REAL,           -- 净利润增速
    pe_ttm REAL,                     -- PE(TTM)
    pb REAL,                         -- PB
    rsi REAL,                        -- RSI(14)
    macd_signal TEXT,                -- MACD 信号 (bullish/bearish/neutral)
    main_flow_in REAL,               -- 主力净流入 (万元)
    
    -- 综合评分
    industry_total_score REAL,       -- 行业总分 (0-10)
    seven_factor_score REAL,         -- 7 因子总分 (0-10)
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_date, ts_code)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_trade_date ON stock_factor_snapshot(trade_date);
CREATE INDEX IF NOT EXISTS idx_trade_date_code ON stock_factor_snapshot(trade_date, ts_code);
CREATE INDEX IF NOT EXISTS idx_code ON stock_factor_snapshot(ts_code);
```

---

## 🔧 实现步骤

### 步骤 1: 创建 SQL 脚本

**文件**: `stock-system/db/migrations/001_create_snapshot_table.sql`

```sql
-- 选股因子历史快照表
-- 创建时间：2026-03-24
-- 用途：存储每日选股因子的历史快照，支持回测系统查询

-- 删除旧表（如有）
DROP TABLE IF EXISTS stock_factor_snapshot;

-- 创建表
CREATE TABLE stock_factor_snapshot (
    trade_date TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    industry TEXT,
    
    -- 4 维度行业筛选因子
    policy_score REAL,
    commercialization_score REAL,
    sentiment_score REAL,
    capital_score REAL,
    
    -- 7 因子个股评分因子
    roe REAL,
    revenue_growth REAL,
    netprofit_growth REAL,
    pe_ttm REAL,
    pb REAL,
    rsi REAL,
    macd_signal TEXT,
    main_flow_in REAL,
    
    -- 综合评分
    industry_total_score REAL,
    seven_factor_score REAL,
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_date, ts_code)
);

-- 创建索引
CREATE INDEX idx_trade_date ON stock_factor_snapshot(trade_date);
CREATE INDEX idx_trade_date_code ON stock_factor_snapshot(trade_date, ts_code);
CREATE INDEX idx_code ON stock_factor_snapshot(ts_code);

-- 添加表注释
COMMENT ON TABLE stock_factor_snapshot IS '选股因子历史快照表 - 存储每日选股因子的历史快照';
```

### 步骤 2: 执行迁移

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db < db/migrations/001_create_snapshot_table.sql
```

### 步骤 3: 验证表结构

```bash
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db <<EOF
-- 检查表是否存在
SELECT name FROM sqlite_master WHERE type='table' AND name='stock_factor_snapshot';

-- 检查表结构
PRAGMA table_info(stock_factor_snapshot);

-- 检查索引
SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='stock_factor_snapshot';

-- 测试插入
INSERT INTO stock_factor_snapshot (
    trade_date, ts_code, industry,
    policy_score, commercialization_score, sentiment_score, capital_score,
    roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal, main_flow_in,
    industry_total_score, seven_factor_score
) VALUES (
    '2026-03-24', '000858.SZ', '白酒',
    8.5, 7.2, 6.8, 9.1,
    25.3, 15.2, 18.5, 22.5, 4.2, 55.0, 'bullish', 1500.0,
    7.9, 8.2
);

-- 测试查询
SELECT * FROM stock_factor_snapshot WHERE ts_code = '000858.SZ' LIMIT 5;
EOF
```

---

## 📝 交付清单

- [ ] 创建 SQL 迁移脚本 `db/migrations/001_create_snapshot_table.sql`
- [ ] 执行迁移，创建表
- [ ] 验证表结构（字段、索引）
- [ ] 测试插入和查询
- [ ] 生成交接文档

---

## 📚 关联文档

- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.2 节
- 关联任务：TASK_SNAPSHOT_002 (policy_events 表), TASK_SNAPSHOT_003 (stock_selection_reports 表)

---

_创建时间：2026-03-24_
