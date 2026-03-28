-- Migration 014: Create strategy_score_records table
-- Date: 2026-03-26

CREATE TABLE IF NOT EXISTS strategy_score_records (
    record_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    
    -- 策略配置 (JSON string)
    config_json TEXT NOT NULL,
    
    -- 7 个评分指标得分
    score_total REAL,
    score_sharpe REAL,
    score_drawdown REAL,
    score_calmar REAL,
    score_profit_loss REAL,
    score_win_rate REAL,
    score_return REAL,
    
    -- 迭代轮次
    iteration_round INTEGER,
    
    -- 时间戳
    created_at TEXT NOT NULL,
    
    FOREIGN KEY (version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX IF NOT EXISTS idx_score_version ON strategy_score_records(version_id);
CREATE INDEX IF NOT EXISTS idx_score_strategy ON strategy_score_records(strategy_type);
CREATE INDEX IF NOT EXISTS idx_score_total ON strategy_score_records(score_total DESC);
