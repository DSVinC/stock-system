-- Migration 017: Create execution_feedback table
-- 用于承接执行流 -> 研究流的最小反馈闭环

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS execution_feedback (
    feedback_id TEXT PRIMARY KEY,

    -- Event identity
    event_type TEXT NOT NULL,                  -- conditional_trigger | simulated_trade | position_closed
    conditional_order_id INTEGER,              -- 来源条件单（可为空）
    trade_id INTEGER,                          -- 来源交易记录（可为空）
    account_id INTEGER,                        -- 账户 ID（可为空）
    ts_code TEXT NOT NULL,                     -- 股票代码

    -- Strategy context snapshot
    strategy_source TEXT,                      -- strategy_config | template | backtest_optimization | analysis_report
    strategy_config_id INTEGER,
    strategy_config_name TEXT,
    template_id INTEGER,
    template_name TEXT,
    strategy_id TEXT,
    strategy_version TEXT,
    version_id TEXT,                           -- 对应 strategy_versions.version_id（可为空）
    report_id TEXT,

    -- Execution facts
    action TEXT,                               -- buy | sell | alert
    quantity INTEGER,
    price REAL,
    amount REAL,
    realized_pnl REAL,
    realized_return REAL,
    holding_days INTEGER,

    -- Extensible payload
    payload_json TEXT,

    -- Timestamps
    occurred_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),

    CONSTRAINT fk_execution_feedback_order
        FOREIGN KEY (conditional_order_id) REFERENCES conditional_order(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_execution_feedback_trade
        FOREIGN KEY (trade_id) REFERENCES portfolio_trade(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_execution_feedback_version
        FOREIGN KEY (version_id) REFERENCES strategy_versions(version_id)
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_execution_feedback_event_type
    ON execution_feedback(event_type);

CREATE INDEX IF NOT EXISTS idx_execution_feedback_ts_code
    ON execution_feedback(ts_code);

CREATE INDEX IF NOT EXISTS idx_execution_feedback_occurred_at
    ON execution_feedback(occurred_at);

CREATE INDEX IF NOT EXISTS idx_execution_feedback_version_id
    ON execution_feedback(version_id);

CREATE INDEX IF NOT EXISTS idx_execution_feedback_order_id
    ON execution_feedback(conditional_order_id);

CREATE INDEX IF NOT EXISTS idx_execution_feedback_trade_id
    ON execution_feedback(trade_id);
