-- 回滚：移除 strategy_configs 表扩展字段
-- 注意：SQLite 不支持 DROP COLUMN，需要重建表

BEGIN TRANSACTION;

-- 1. 创建临时表（保留原始字段）
CREATE TABLE strategy_configs_backup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,

    policy_weight REAL DEFAULT 0.25,
    commercialization_weight REAL DEFAULT 0.30,
    sentiment_weight REAL DEFAULT 0.25,
    capital_weight REAL DEFAULT 0.20,

    revenue_growth_min REAL DEFAULT 0.20,
    gross_margin_min REAL DEFAULT 0.25,

    sentiment_top_percentile REAL DEFAULT 0.20,

    seven_factor_min_score REAL DEFAULT 0.75,

    pe_max REAL DEFAULT 60.0,
    peg_max REAL DEFAULT 2.0,

    core_ratio REAL DEFAULT 0.75,
    satellite_ratio REAL DEFAULT 0.25,
    satellite_count INTEGER DEFAULT 3,

    grid_step REAL DEFAULT 0.012,
    grid_price_range TEXT DEFAULT '3_months',
    grid_single_amount REAL DEFAULT 30000,
    grid_trend_filter INTEGER DEFAULT 1,

    max_drawdown REAL DEFAULT -0.20,
    min_annual_return REAL DEFAULT 0.15,
    min_win_rate REAL DEFAULT 0.55,

    is_active INTEGER DEFAULT 1,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT DEFAULT 'system',

    CHECK (policy_weight + commercialization_weight + sentiment_weight + capital_weight BETWEEN 0.99 AND 1.01),
    CHECK (core_ratio + satellite_ratio BETWEEN 0.99 AND 1.01)
);

-- 2. 复制数据到临时表
INSERT INTO strategy_configs_backup
SELECT
    id, name, version, description,
    policy_weight, commercialization_weight, sentiment_weight, capital_weight,
    revenue_growth_min, gross_margin_min, sentiment_top_percentile,
    seven_factor_min_score, pe_max, peg_max,
    core_ratio, satellite_ratio, satellite_count,
    grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
    max_drawdown, min_annual_return, min_win_rate,
    is_active, is_default, created_at, updated_at, created_by
FROM strategy_configs;

-- 3. 删除原表
DROP TABLE strategy_configs;

-- 4. 重命名临时表
ALTER TABLE strategy_configs_backup RENAME TO strategy_configs;

-- 5. 重建索引
CREATE INDEX IF NOT EXISTS idx_strategy_configs_version ON strategy_configs(version);
CREATE INDEX IF NOT EXISTS idx_strategy_configs_active ON strategy_configs(is_active);

COMMIT;