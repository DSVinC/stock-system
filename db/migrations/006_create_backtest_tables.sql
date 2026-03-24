-- 回测相关数据库表
-- 创建时间：2026-03-24
-- 用途：TASK_V3_101 日线回测引擎
-- 版本：006

-- ============================================
-- 回测历史表
-- ============================================
CREATE TABLE IF NOT EXISTS backtest_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    strategy_config TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    initial_capital REAL NOT NULL,
    final_capital REAL,
    total_return REAL,
    annualized_return REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    win_rate REAL,
    trade_count INTEGER DEFAULT 0,
    volatility REAL,
    result_summary TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_backtest_history_date
ON backtest_history(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_backtest_history_created
ON backtest_history(created_at DESC);

-- ============================================
-- 回测明细表（交易记录）
-- ============================================
CREATE TABLE IF NOT EXISTS backtest_detail (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backtest_id INTEGER NOT NULL,
    trade_date TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    stock_name TEXT,
    action TEXT NOT NULL CHECK(action IN ('BUY', 'SELL')),
    quantity INTEGER NOT NULL DEFAULT 0,
    price REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    commission REAL DEFAULT 0,
    profit REAL DEFAULT 0,
    profit_rate REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (backtest_id) REFERENCES backtest_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_backtest_detail_backtest
ON backtest_detail(backtest_id);

CREATE INDEX IF NOT EXISTS idx_backtest_detail_date
ON backtest_detail(backtest_id, trade_date);

CREATE INDEX IF NOT EXISTS idx_backtest_detail_code
ON backtest_detail(backtest_id, ts_code);

-- ============================================
-- 参数扫描表
-- ============================================
CREATE TABLE IF NOT EXISTS backtest_parameter_scan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    base_backtest_id INTEGER NOT NULL,
    parameter_name TEXT NOT NULL,
    parameter_value REAL NOT NULL,
    total_return REAL,
    annualized_return REAL,
    sharpe_ratio REAL,
    max_drawdown REAL,
    win_rate REAL,
    trade_count INTEGER DEFAULT 0,
    result_summary TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (base_backtest_id) REFERENCES backtest_history(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parameter_scan_base
ON backtest_parameter_scan(base_backtest_id);

-- ============================================
-- 回测权益曲线表（每日资产记录）
-- ============================================
CREATE TABLE IF NOT EXISTS backtest_equity_curve (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backtest_id INTEGER NOT NULL,
    trade_date TEXT NOT NULL,
    cash REAL NOT NULL DEFAULT 0,
    position_value REAL NOT NULL DEFAULT 0,
    total_value REAL NOT NULL DEFAULT 0,
    daily_return REAL DEFAULT 0,
    cumulative_return REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (backtest_id) REFERENCES backtest_history(id) ON DELETE CASCADE,
    UNIQUE(backtest_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_equity_curve_backtest
ON backtest_equity_curve(backtest_id);

CREATE INDEX IF NOT EXISTS idx_equity_curve_date
ON backtest_equity_curve(backtest_id, trade_date);

-- ============================================
-- 回测持仓快照表（每日持仓记录）
-- ============================================
CREATE TABLE IF NOT EXISTS backtest_position_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    backtest_id INTEGER NOT NULL,
    trade_date TEXT NOT NULL,
    ts_code TEXT NOT NULL,
    stock_name TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL DEFAULT 0,
    current_price REAL NOT NULL DEFAULT 0,
    market_value REAL NOT NULL DEFAULT 0,
    profit_loss REAL DEFAULT 0,
    profit_loss_rate REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (backtest_id) REFERENCES backtest_history(id) ON DELETE CASCADE,
    UNIQUE(backtest_id, trade_date, ts_code)
);

CREATE INDEX IF NOT EXISTS idx_position_snapshot_backtest
ON backtest_position_snapshot(backtest_id);

CREATE INDEX IF NOT EXISTS idx_position_snapshot_date
ON backtest_position_snapshot(backtest_id, trade_date);