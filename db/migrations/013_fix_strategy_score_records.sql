-- Migration 013: Fix strategy_score_records table
-- Add missing score_profit_loss column
-- Date: 2026-03-26

-- Add score_profit_loss column (盈亏比得分)
ALTER TABLE strategy_score_records ADD COLUMN score_profit_loss REAL;

-- Create strategy_iteration_log table if not exists
CREATE TABLE IF NOT EXISTS strategy_iteration_log (
    log_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    action TEXT NOT NULL,
    reason TEXT,
    before_config TEXT,
    after_config TEXT,
    result TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (version_id) REFERENCES strategy_versions(version_id)
);