-- 扩展 strategy_configs 表结构
-- 支持多策略模板库、投资组合配置、网格交易参数、回测时间段配置

-- 添加新字段
ALTER TABLE strategy_configs ADD COLUMN template_id TEXT;
ALTER TABLE strategy_configs ADD COLUMN portfolio_config TEXT;  -- JSON: {core_ratio, satellite_ratio, satellite_count}
ALTER TABLE strategy_configs ADD COLUMN grid_config TEXT;       -- JSON: {grid_size, grid_count, trigger_price, grid_step, price_range, single_amount, trend_filter}
ALTER TABLE strategy_configs ADD COLUMN backtest_period TEXT;   -- JSON: {start_date, end_date, preset}

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_strategy_configs_template_id ON strategy_configs(template_id);

-- 更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_strategy_configs_updated_at
AFTER UPDATE ON strategy_configs
FOR EACH ROW
BEGIN
    UPDATE strategy_configs SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- 为现有记录设置默认 JSON 配置（兼容旧数据）
UPDATE strategy_configs
SET
    portfolio_config = json_object(
        'core_ratio', core_ratio,
        'satellite_ratio', satellite_ratio,
        'satellite_count', satellite_count
    ),
    grid_config = json_object(
        'grid_step', grid_step,
        'grid_price_range', grid_price_range,
        'grid_single_amount', grid_single_amount,
        'grid_trend_filter', grid_trend_filter,
        'grid_size', 0.05,
        'grid_count', 10,
        'trigger_price', NULL
    ),
    backtest_period = json_object(
        'start_date', NULL,
        'end_date', NULL,
        'preset', '1_year'
    )
WHERE portfolio_config IS NULL OR grid_config IS NULL OR backtest_period IS NULL;