-- TASK_MOCK_001
-- 独立模拟账户基础表（4 张）
-- 说明：016 序号已被占用，本迁移使用 018。

PRAGMA foreign_keys = ON;

-- 1) 模拟账户
CREATE TABLE IF NOT EXISTS mock_account (
    account_id TEXT PRIMARY KEY,                 -- UUID
    strategy_version_id TEXT NOT NULL,
    strategy_type TEXT,
    account_name TEXT,
    initial_capital REAL NOT NULL,
    current_capital REAL NOT NULL,
    available_capital REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',       -- active/stopped/closed
    created_at TEXT NOT NULL,
    started_at TEXT,
    stopped_at TEXT,
    FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_account_strategy
ON mock_account(strategy_version_id);

CREATE INDEX IF NOT EXISTS idx_mock_account_status
ON mock_account(status);

-- 2) 模拟持仓
CREATE TABLE IF NOT EXISTS mock_position (
    position_id TEXT PRIMARY KEY,                -- UUID
    account_id TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    avg_cost REAL NOT NULL,
    current_price REAL,
    market_value REAL,
    unrealized_pnl REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY (account_id) REFERENCES mock_account(account_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_mock_position_account_stock
ON mock_position(account_id, ts_code);

CREATE INDEX IF NOT EXISTS idx_mock_position_account
ON mock_position(account_id);

CREATE INDEX IF NOT EXISTS idx_mock_position_ts_code
ON mock_position(ts_code);

-- 3) 模拟交易
CREATE TABLE IF NOT EXISTS mock_trade (
    trade_id TEXT PRIMARY KEY,                   -- UUID
    account_id TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    action TEXT NOT NULL,                        -- BUY/SELL
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    simulated_price REAL NOT NULL,
    slippage_rate REAL NOT NULL DEFAULT 0.001,
    commission REAL NOT NULL DEFAULT 0.0,
    stamp_duty REAL NOT NULL DEFAULT 0.0,
    pnl REAL,
    trade_type TEXT NOT NULL DEFAULT 'simulation',
    trigger_source TEXT,
    strategy_version_id TEXT,
    data_date TEXT NOT NULL,                     -- 实时数据日 YYYYMMDD
    execution_status TEXT NOT NULL DEFAULT 'FILLED',
    reject_reason TEXT,
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mock_account(account_id),
    FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_trade_account
ON mock_trade(account_id);

CREATE INDEX IF NOT EXISTS idx_mock_trade_ts_code
ON mock_trade(ts_code);

CREATE INDEX IF NOT EXISTS idx_mock_trade_occurred_at
ON mock_trade(occurred_at);

CREATE INDEX IF NOT EXISTS idx_mock_trade_data_date
ON mock_trade(data_date);

-- 4) 模拟绩效
CREATE TABLE IF NOT EXISTS mock_performance (
    performance_id TEXT PRIMARY KEY,             -- UUID
    account_id TEXT NOT NULL,
    strategy_version_id TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,

    total_return REAL,
    annualized_return REAL,
    excess_return REAL,
    max_drawdown REAL,
    volatility REAL,
    var_95 REAL,
    sharpe_ratio REAL,
    sortino_ratio REAL,
    calmar_ratio REAL,

    trade_count INTEGER,
    win_count INTEGER,
    loss_count INTEGER,
    win_rate REAL,
    avg_win REAL,
    avg_loss REAL,
    profit_loss_ratio REAL,
    avg_holding_period REAL,
    turnover_rate REAL,

    avg_slippage REAL,
    total_commission REAL,
    total_stamp_duty REAL,

    backtest_total_return REAL,
    backtest_deviation REAL,
    backtest_max_drawdown REAL,
    drawdown_deviation REAL,
    backtest_win_rate REAL,
    win_rate_deviation REAL,
    deviation_threshold REAL DEFAULT 0.20,
    is_deviation_exceeded INTEGER NOT NULL DEFAULT 0,
    sample_trade_threshold INTEGER NOT NULL DEFAULT 20,
    is_sample_valid INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES mock_account(account_id),
    FOREIGN KEY (strategy_version_id) REFERENCES strategy_versions(version_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_performance_account
ON mock_performance(account_id);

CREATE INDEX IF NOT EXISTS idx_mock_performance_period
ON mock_performance(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_mock_performance_deviation
ON mock_performance(is_deviation_exceeded);
