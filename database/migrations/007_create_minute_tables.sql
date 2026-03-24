-- =============================================================================
-- Migration: 007_create_minute_tables
-- Description: Create tables for minute data fetching and storage
-- Task: TASK_V3_006
-- Created: 2026-03-24
-- =============================================================================

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- =============================================================================
-- STOCK_MINUTE TABLE
-- Stores 5-minute line data for stocks
-- =============================================================================
CREATE TABLE IF NOT EXISTS stock_minute (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_code         TEXT NOT NULL,          -- 股票代码 (000001.SZ)
    trade_date      TEXT NOT NULL,          -- 交易日期 (20260324)
    trade_time      TEXT NOT NULL,          -- 交易时间 (09:30:00)
    open            REAL,                   -- 开盘价
    high            REAL,                   -- 最高价
    low             REAL,                   -- 最低价
    close           REAL,                   -- 收盘价
    pre_close       REAL,                   -- 昨收价
    change          REAL,                   -- 涨跌额
    pct_change      REAL,                   -- 涨跌幅
    vol             REAL,                   -- 成交量（手）
    amount          REAL,                   -- 成交额（千元）
    adj_factor      REAL DEFAULT 1,         -- 复权因子
    data_source     TEXT DEFAULT 'baostock', -- 数据来源
    fetch_status    TEXT DEFAULT 'success', -- 获取状态
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(ts_code, trade_date, trade_time)
);

-- Stock minute indexes
CREATE INDEX IF NOT EXISTS idx_stock_minute_ts_code ON stock_minute(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_minute_trade_date ON stock_minute(trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_minute_ts_code_date ON stock_minute(ts_code, trade_date);

-- =============================================================================
-- MINUTE_FETCH_TASKS TABLE
-- Stores minute data fetch task records
-- =============================================================================
CREATE TABLE IF NOT EXISTS minute_fetch_tasks (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id         TEXT NOT NULL,          -- 任务ID
    ts_code         TEXT NOT NULL,          -- 股票代码
    start_date      TEXT,                   -- 开始日期
    end_date        TEXT,                   -- 结束日期
    status          TEXT DEFAULT 'pending', -- pending|running|success|failed
    total_days      INTEGER DEFAULT 0,      -- 总天数
    processed_days  INTEGER DEFAULT 0,      -- 已处理天数
    total_records   INTEGER DEFAULT 0,      -- 总记录数
    processed_records INTEGER DEFAULT 0,    -- 已处理记录数
    error_count     INTEGER DEFAULT 0,      -- 错误次数
    last_error      TEXT,                   -- 最后错误信息
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    started_at      TEXT,
    completed_at    TEXT
);

-- Minute fetch tasks indexes
CREATE INDEX IF NOT EXISTS idx_minute_fetch_tasks_task_id ON minute_fetch_tasks(task_id);
CREATE INDEX IF NOT EXISTS idx_minute_fetch_tasks_ts_code ON minute_fetch_tasks(ts_code);
CREATE INDEX IF NOT EXISTS idx_minute_fetch_tasks_status ON minute_fetch_tasks(status);
CREATE INDEX IF NOT EXISTS idx_minute_fetch_tasks_created_at ON minute_fetch_tasks(created_at);

-- =============================================================================
-- STOCK_MINUTE_STATS TABLE
-- Daily statistics for minute data quality
-- =============================================================================
CREATE TABLE IF NOT EXISTS stock_minute_stats (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_code         TEXT NOT NULL,          -- 股票代码
    trade_date      TEXT NOT NULL,          -- 交易日期
    total_records   INTEGER DEFAULT 0,      -- 总记录数
    expected_records INTEGER DEFAULT 48,    -- 预期记录数（48条5分钟线）
    missing_records INTEGER DEFAULT 0,      -- 缺失记录数
    data_quality    TEXT DEFAULT 'missing', -- complete|partial|missing
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(ts_code, trade_date)
);

-- Stock minute stats indexes
CREATE INDEX IF NOT EXISTS idx_stock_minute_stats_ts_code ON stock_minute_stats(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_minute_stats_trade_date ON stock_minute_stats(trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_minute_stats_quality ON stock_minute_stats(data_quality);

-- =============================================================================
-- TRIGGER: Update stock_minute updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_stock_minute_updated_at
AFTER UPDATE ON stock_minute
BEGIN
    UPDATE stock_minute SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- TRIGGER: Update stock_minute_stats updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_stock_minute_stats_updated_at
AFTER UPDATE ON stock_minute_stats
BEGIN
    UPDATE stock_minute_stats SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- VIEW: Minute data availability summary
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_minute_data_summary AS
SELECT
    ts_code,
    COUNT(DISTINCT trade_date) as total_days,
    COUNT(*) as total_records,
    MIN(trade_date) as earliest_date,
    MAX(trade_date) as latest_date,
    ROUND(AVG(vol), 2) as avg_volume,
    ROUND(AVG(amount), 2) as avg_amount
FROM stock_minute
GROUP BY ts_code;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================