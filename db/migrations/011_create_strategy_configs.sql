-- 策略配置表
-- 用于存储选股策略的权重配置和参数

CREATE TABLE IF NOT EXISTS strategy_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                    -- 策略名称（如：行业 7 因子 v1.0）
    version TEXT NOT NULL,                 -- 版本号（如：1.0.0）
    description TEXT,                      -- 策略描述
    
    -- 四维度行业权重（总和 100%）
    policy_weight REAL DEFAULT 0.25,       -- 政策支持权重
    commercialization_weight REAL DEFAULT 0.30,  -- 商业化显现权重
    sentiment_weight REAL DEFAULT 0.25,    -- 舆论热度权重
    capital_weight REAL DEFAULT 0.20,      -- 资本认可权重
    
    -- 商业化显现阈值
    revenue_growth_min REAL DEFAULT 0.20,  -- 营收增速下限（20%）
    gross_margin_min REAL DEFAULT 0.25,    -- 毛利率下限（25%）
    
    -- 舆论热度阈值
    sentiment_top_percentile REAL DEFAULT 0.20,  -- 热度前 20%
    
    -- 7 因子评分阈值
    seven_factor_min_score REAL DEFAULT 0.75,  -- 7 因子最低分
    
    -- 估值阈值
    pe_max REAL DEFAULT 60.0,              -- PE 上限
    peg_max REAL DEFAULT 2.0,              -- PEG 上限
    
    -- 核心 - 卫星配置
    core_ratio REAL DEFAULT 0.75,          -- 核心仓比例（75%）
    satellite_ratio REAL DEFAULT 0.25,     -- 卫星仓比例（25%）
    satellite_count INTEGER DEFAULT 3,     -- 卫星仓股票数量
    
    -- 网格交易配置
    grid_step REAL DEFAULT 0.012,          -- 网格步长（1.2%）
    grid_price_range TEXT DEFAULT '3_months',  -- 价格区间（3_months/6_months/12_months）
    grid_single_amount REAL DEFAULT 30000, -- 单笔金额（3 万）
    grid_trend_filter INTEGER DEFAULT 1,   -- 趋势过滤（1=启用，0=禁用）
    
    -- 风控配置
    max_drawdown REAL DEFAULT -0.20,       -- 最大回撤（-20%）
    min_annual_return REAL DEFAULT 0.15,   -- 最小年化收益（15%）
    min_win_rate REAL DEFAULT 0.55,        -- 最小胜率（55%）
    
    -- 元数据
    is_active INTEGER DEFAULT 1,           -- 是否激活（1=是，0=否）
    is_default INTEGER DEFAULT 0,          -- 是否默认配置
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT DEFAULT 'system',
    
    -- 约束
    CHECK (policy_weight + commercialization_weight + sentiment_weight + capital_weight BETWEEN 0.99 AND 1.01),
    CHECK (core_ratio + satellite_ratio BETWEEN 0.99 AND 1.01)
);

-- 插入默认配置
INSERT INTO strategy_configs (
    name, version, description,
    policy_weight, commercialization_weight, sentiment_weight, capital_weight,
    revenue_growth_min, gross_margin_min, sentiment_top_percentile,
    seven_factor_min_score, pe_max, peg_max,
    core_ratio, satellite_ratio, satellite_count,
    grid_step, grid_price_range, grid_single_amount, grid_trend_filter,
    max_drawdown, min_annual_return, min_win_rate,
    is_default
) VALUES (
    '行业 7 因子策略', '1.0.0', '默认策略：四维度行业筛选 + 7 因子个股评分',
    0.25, 0.30, 0.25, 0.20,
    0.20, 0.25, 0.20,
    0.75, 60.0, 2.0,
    0.75, 0.25, 3,
    0.012, '3_months', 30000, 1,
    -0.20, 0.15, 0.55,
    1
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_strategy_configs_version ON strategy_configs(version);
CREATE INDEX IF NOT EXISTS idx_strategy_configs_active ON strategy_configs(is_active);
