-- TASK_V3_103: 回测结果缓存表
-- 创建时间: 2026-03-24
-- 功能: 缓存回测结果，避免重复计算

-- 缓存表
CREATE TABLE IF NOT EXISTS backtest_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    strategy_config TEXT NOT NULL,      -- JSON 格式的策略配置
    start_date TEXT NOT NULL,           -- 回测开始日期
    end_date TEXT NOT NULL,             -- 回测结束日期
    result_json TEXT NOT NULL,          -- JSON 格式的回测结果
    hit_count INTEGER DEFAULT 0,        -- 缓存命中次数
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT                     -- 过期时间
);

-- 索引加速查询
CREATE INDEX IF NOT EXISTS idx_backtest_cache_key ON backtest_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_backtest_cache_expires ON backtest_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_backtest_cache_dates ON backtest_cache(start_date, end_date);

-- 命中统计表（可选，用于分析）
CREATE TABLE IF NOT EXISTS backtest_cache_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT NOT NULL,
    hit_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (cache_key) REFERENCES backtest_cache(cache_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_cache_stats_key ON backtest_cache_stats(cache_key);