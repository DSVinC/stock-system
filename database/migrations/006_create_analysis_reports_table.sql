-- =============================================================================
-- Migration: 006_create_analysis_reports_table
-- Description: Create stock analysis reports table for storing analysis reports
-- Created: 2026-03-24
-- =============================================================================

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- =============================================================================
-- STOCK_ANALYSIS_REPORTS TABLE
-- Stores stock analysis reports with decision information
-- =============================================================================
CREATE TABLE IF NOT EXISTS stock_analysis_reports (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id       TEXT UNIQUE NOT NULL,
    stock_code      TEXT NOT NULL,
    stock_name      TEXT,
    report_json     TEXT NOT NULL,  -- 完整报告 JSON
    decision        TEXT,           -- buy|watch|avoid
    rating          INTEGER,        -- 1-5 星
    stop_loss       REAL,           -- 止损价
    stop_profit     TEXT,           -- 止盈价数组 JSON
    entry_zone      TEXT,           -- 建仓区间 JSON
    add_position    TEXT,           -- 加仓条件 JSON
    key_events      TEXT,           -- 关键事件 JSON
    created_at      TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Stock analysis reports indexes
CREATE INDEX IF NOT EXISTS idx_stock_analysis_reports_stock_code ON stock_analysis_reports(stock_code);
CREATE INDEX IF NOT EXISTS idx_stock_analysis_reports_created_at ON stock_analysis_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_stock_analysis_reports_decision ON stock_analysis_reports(decision);

-- =============================================================================
-- TRIGGER: Update updated_at timestamp
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_stock_analysis_reports_updated_at
AFTER UPDATE ON stock_analysis_reports
BEGIN
    UPDATE stock_analysis_reports SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- VIEW: Latest stock analysis reports
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_latest_stock_analysis AS
SELECT
    r1.*
FROM stock_analysis_reports r1
INNER JOIN (
    SELECT
        stock_code,
        MAX(created_at) AS latest_date
    FROM stock_analysis_reports
    GROUP BY stock_code
) r2 ON r1.stock_code = r2.stock_code AND r1.created_at = r2.latest_date;

-- =============================================================================
-- VIEW: Stock analysis reports with decisions for conditional orders
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_stock_analysis_for_conditionals AS
SELECT
    id,
    report_id,
    stock_code,
    stock_name,
    decision,
    rating,
    stop_loss,
    json_extract(stop_profit, '$[0]') AS stop_profit_1,
    json_extract(stop_profit, '$[1]') AS stop_profit_2,
    json_extract(stop_profit, '$[2]') AS stop_profit_3,
    json_extract(entry_zone, '$[0]') AS entry_zone_low,
    json_extract(entry_zone, '$[1]') AS entry_zone_high,
    json_extract(add_position, '$[0]') AS add_position_1,
    json_extract(add_position, '$[1]') AS add_position_2,
    key_events,
    created_at
FROM stock_analysis_reports
WHERE decision IS NOT NULL
    AND stop_loss IS NOT NULL
    AND stop_profit IS NOT NULL
    AND entry_zone IS NOT NULL
ORDER BY created_at DESC;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================