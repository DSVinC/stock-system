-- Migration 015: Create strategy_versions table
-- Date: 2026-03-26
-- Purpose: Support V5 auto-iteration system version management

CREATE TABLE IF NOT EXISTS strategy_versions (
    version_id TEXT PRIMARY KEY,
    strategy_type TEXT NOT NULL,
    strategy_name TEXT NOT NULL,
    
    -- 策略参数配置 (JSON string)
    config_json TEXT NOT NULL,
    
    -- 评分结果
    backtest_score REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    calmar_ratio REAL,
    profit_loss_ratio REAL,
    win_rate REAL,
    total_return REAL,
    
    -- 回测结果 (JSON string)
    simulation_result TEXT,
    
    -- 版本元数据
    created_at TEXT NOT NULL,
    parent_version TEXT,
    change_log TEXT,
    created_by TEXT DEFAULT 'system',
    tags TEXT
);

CREATE INDEX IF NOT EXISTS idx_versions_strategy ON strategy_versions(strategy_type);
CREATE INDEX IF NOT EXISTS idx_versions_score ON strategy_versions(backtest_score DESC);
CREATE INDEX IF NOT EXISTS idx_versions_created ON strategy_versions(created_at DESC);
