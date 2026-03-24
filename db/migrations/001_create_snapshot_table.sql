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

-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_trade_date ON stock_factor_snapshot(trade_date);
CREATE INDEX IF NOT EXISTS idx_trade_date_code ON stock_factor_snapshot(trade_date, ts_code);
CREATE INDEX IF NOT EXISTS idx_code ON stock_factor_snapshot(ts_code);

-- SQLite 不支持 COMMENT ON TABLE 语法，使用 PRAGMA user_version 记录版本
-- 表注释：选股因子历史快照表 - 存储每日选股因子的历史快照