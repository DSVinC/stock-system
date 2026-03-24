-- stock_minute 分钟线数据表
-- 创建时间：2026-03-24
-- 用途：存储股票分钟线数据，支持技术分析和实时监控
-- 数据范围：近 1 年（250 交易日）
-- 数据粒度：5 分钟线
-- 目标股票：Top10 核心股票池
-- 存储成本：约 120MB

-- 删除旧表（如有）
DROP TABLE IF EXISTS stock_minute;

-- 创建表
CREATE TABLE stock_minute (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts_code TEXT NOT NULL,           -- 股票代码 (e.g., '000001.SZ')
    trade_date TEXT NOT NULL,        -- 交易日 (YYYYMMDD)
    trade_time TEXT NOT NULL,        -- 交易时间 (HH:MM:SS)
    open REAL NOT NULL,              -- 开盘价
    high REAL NOT NULL,              -- 最高价
    low REAL NOT NULL,               -- 最低价
    close REAL NOT NULL,             -- 收盘价
    pre_close REAL,                  -- 前收盘价
    change REAL,                     -- 涨跌额
    pct_change REAL,                 -- 涨跌幅 (%)
    vol REAL NOT NULL,               -- 成交量 (手)
    amount REAL NOT NULL,            -- 成交额 (元)
    adj_factor REAL DEFAULT 1.0,     -- 复权因子
    data_source TEXT DEFAULT 'baostock', -- 数据源
    fetch_status TEXT DEFAULT 'success', -- 获取状态: success, error, partial
    error_message TEXT,              -- 错误信息
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, -- 创建时间
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP, -- 更新时间
    
    UNIQUE(trade_date, trade_time, ts_code)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_minute_ts_code ON stock_minute(ts_code);
CREATE INDEX IF NOT EXISTS idx_minute_trade_date ON stock_minute(trade_date);
CREATE INDEX IF NOT EXISTS idx_minute_trade_time ON stock_minute(trade_time);
CREATE INDEX IF NOT EXISTS idx_minute_code_date ON stock_minute(ts_code, trade_date);
CREATE INDEX IF NOT EXISTS idx_minute_code_date_time ON stock_minute(ts_code, trade_date, trade_time);

-- 创建分钟线数据统计表（用于监控数据完整性）
DROP TABLE IF EXISTS stock_minute_stats;
CREATE TABLE stock_minute_stats (
    ts_code TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    total_records INTEGER DEFAULT 0,     -- 总记录数（正常应为48条/天）
    missing_records INTEGER DEFAULT 0,   -- 缺失记录数
    earliest_time TEXT,                  -- 最早时间
    latest_time TEXT,                    -- 最晚时间
    data_quality TEXT DEFAULT 'unknown', -- 数据质量: complete, partial, missing
    last_checked TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ts_code, trade_date)
);

-- 创建分钟线获取任务表
DROP TABLE IF EXISTS minute_fetch_tasks;
CREATE TABLE minute_fetch_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id TEXT NOT NULL,               -- 任务ID
    ts_code TEXT NOT NULL,               -- 股票代码
    start_date TEXT NOT NULL,            -- 开始日期
    end_date TEXT NOT NULL,              -- 结束日期
    status TEXT DEFAULT 'pending',       -- 状态: pending, running, success, failed
    total_days INTEGER DEFAULT 0,        -- 总天数
    processed_days INTEGER DEFAULT 0,    -- 已处理天数
    total_records INTEGER DEFAULT 0,     -- 总记录数
    processed_records INTEGER DEFAULT 0, -- 已处理记录数
    error_count INTEGER DEFAULT 0,       -- 错误次数
    last_error TEXT,                     -- 最后错误信息
    started_at TEXT,                     -- 开始时间
    completed_at TEXT,                   -- 完成时间
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, ts_code)
);

-- SQLite 不支持 COMMENT ON TABLE 语法，使用 PRAGMA user_version 记录版本
-- 表注释：股票分钟线数据表 - 存储5分钟线数据，用于技术分析和实时监控