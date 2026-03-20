-- =============================================================================
-- Simulation Account Database Schema
-- Stock Monitoring System
-- =============================================================================

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- =============================================================================
-- ACCOUNTS TABLE
-- Stores simulation account information
-- =============================================================================
CREATE TABLE IF NOT EXISTS accounts (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            VARCHAR(100) NOT NULL,
    initial_capital DECIMAL(15, 4) NOT NULL DEFAULT 1000000.0000,
    current_capital DECIMAL(15, 4) NOT NULL DEFAULT 1000000.0000,
    frozen_capital  DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    settings        JSON,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_initial_capital CHECK (initial_capital >= 0),
    CONSTRAINT chk_current_capital CHECK (current_capital >= 0),
    CONSTRAINT chk_frozen_capital CHECK (frozen_capital >= 0),
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);

-- Accounts indexes
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at);

-- =============================================================================
-- POSITIONS TABLE
-- Tracks stock holdings for each account
-- =============================================================================
CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL,
    stock_code      VARCHAR(20) NOT NULL,
    stock_name      VARCHAR(100),
    quantity        INTEGER NOT NULL DEFAULT 0,
    avg_price       DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    current_price   DECIMAL(12, 4),
    market_value    DECIMAL(15, 4) DEFAULT 0.0000,
    unrealized_pnl  DECIMAL(15, 4) DEFAULT 0.0000,
    realized_pnl    DECIMAL(15, 4) DEFAULT 0.0000,
    max_position    INTEGER DEFAULT 0,
    stop_loss_price DECIMAL(12, 4),
    take_profit_price DECIMAL(12, 4),
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_positions_account
        FOREIGN KEY (account_id) REFERENCES accounts(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_quantity CHECK (quantity >= 0),
    CONSTRAINT chk_avg_price CHECK (avg_price >= 0),
    CONSTRAINT uq_account_stock UNIQUE (account_id, stock_code)
);

-- Positions indexes
CREATE INDEX IF NOT EXISTS idx_positions_account_id ON positions(account_id);
CREATE INDEX IF NOT EXISTS idx_positions_stock_code ON positions(stock_code);
CREATE INDEX IF NOT EXISTS idx_positions_updated_at ON positions(updated_at);

-- =============================================================================
-- TRADES TABLE
-- Records all buy/sell transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS trades (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL,
    stock_code      VARCHAR(20) NOT NULL,
    stock_name      VARCHAR(100),
    trade_type      VARCHAR(10) NOT NULL,
    quantity        INTEGER NOT NULL,
    price           DECIMAL(12, 4) NOT NULL,
    total_amount    DECIMAL(15, 4) NOT NULL,
    fees            DECIMAL(12, 4) DEFAULT 0.0000,
    tax             DECIMAL(12, 4) DEFAULT 0.0000,
    realized_pnl    DECIMAL(15, 4),
    trade_date      DATE NOT NULL,
    trade_time      TIME,
    strategy_id     INTEGER,
    order_source    VARCHAR(50),
    notes           TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_trades_account
        FOREIGN KEY (account_id) REFERENCES accounts(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_trade_type CHECK (trade_type IN ('BUY', 'SELL')),
    CONSTRAINT chk_trade_quantity CHECK (quantity > 0),
    CONSTRAINT chk_trade_price CHECK (price > 0)
);

-- Trades indexes
CREATE INDEX IF NOT EXISTS idx_trades_account_id ON trades(account_id);
CREATE INDEX IF NOT EXISTS idx_trades_stock_code ON trades(stock_code);
CREATE INDEX IF NOT EXISTS idx_trades_trade_date ON trades(trade_date);
CREATE INDEX IF NOT EXISTS idx_trades_trade_type ON trades(trade_type);
CREATE INDEX IF NOT EXISTS idx_trades_strategy_id ON trades(strategy_id);

-- =============================================================================
-- MONITORING_STRATEGIES TABLE
-- Stores monitoring strategy configurations
-- =============================================================================
CREATE TABLE IF NOT EXISTS monitoring_strategies (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER,
    stock_code      VARCHAR(20),
    strategy_type   VARCHAR(50) NOT NULL,
    strategy_config JSON NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    alert_threshold DECIMAL(12, 4),
    check_interval  INTEGER DEFAULT 60,
    last_checked_at DATETIME,
    last_triggered_at DATETIME,
    total_triggers  INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_strategies_account
        FOREIGN KEY (account_id) REFERENCES accounts(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_strategy_status CHECK (status IN ('ACTIVE', 'PAUSED', 'DISABLED')),
    CONSTRAINT chk_check_interval CHECK (check_interval >= 5)
);

-- Monitoring strategies indexes
CREATE INDEX IF NOT EXISTS idx_strategies_account_id ON monitoring_strategies(account_id);
CREATE INDEX IF NOT EXISTS idx_strategies_stock_code ON monitoring_strategies(stock_code);
CREATE INDEX IF NOT EXISTS idx_strategies_status ON monitoring_strategies(status);
CREATE INDEX IF NOT EXISTS idx_strategies_last_checked ON monitoring_strategies(last_checked_at);

-- =============================================================================
-- DAILY_SNAPSHOTS TABLE
-- Stores daily account and position snapshots for historical analysis
-- =============================================================================
CREATE TABLE IF NOT EXISTS daily_snapshots (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id      INTEGER NOT NULL,
    snapshot_date   DATE NOT NULL,
    total_capital   DECIMAL(15, 4) NOT NULL,
    available_capital DECIMAL(15, 4) NOT NULL,
    market_value    DECIMAL(15, 4) NOT NULL,
    total_pnl       DECIMAL(15, 4) NOT NULL,
    total_positions INTEGER DEFAULT 0,
    position_details JSON,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_snapshots_account
        FOREIGN KEY (account_id) REFERENCES accounts(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_account_date UNIQUE (account_id, snapshot_date)
);

-- Daily snapshots indexes
CREATE INDEX IF NOT EXISTS idx_snapshots_account_id ON daily_snapshots(account_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_snapshot_date ON daily_snapshots(snapshot_date);

-- =============================================================================
-- TRIGGER: Update accounts.updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at
AFTER UPDATE ON accounts
BEGIN
    UPDATE accounts SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- TRIGGER: Update positions.updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_positions_updated_at
AFTER UPDATE ON positions
BEGIN
    UPDATE positions SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- TRIGGER: Update monitoring_strategies.updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_strategies_updated_at
AFTER UPDATE ON monitoring_strategies
BEGIN
    UPDATE monitoring_strategies SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;

-- =============================================================================
-- VIEW: Account Summary
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_account_summary AS
SELECT
    a.id,
    a.name,
    a.initial_capital,
    a.current_capital,
    a.frozen_capital,
    a.current_capital - a.frozen_capital AS available_capital,
    COALESCE(SUM(p.market_value), 0) AS total_market_value,
    COALESCE(SUM(p.unrealized_pnl), 0) AS total_unrealized_pnl,
    COALESCE(SUM(p.realized_pnl), 0) AS total_realized_pnl,
    a.status,
    a.created_at
FROM accounts a
LEFT JOIN positions p ON a.id = p.account_id
GROUP BY a.id, a.name, a.initial_capital, a.current_capital,
         a.frozen_capital, a.status, a.created_at;

-- =============================================================================
-- VIEW: Position Details
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_position_details AS
SELECT
    p.id,
    p.account_id,
    a.name AS account_name,
    p.stock_code,
    p.stock_name,
    p.quantity,
    p.avg_price,
    p.current_price,
    p.quantity * p.avg_price AS cost_basis,
    p.market_value,
    p.unrealized_pnl,
    CASE
        WHEN p.avg_price > 0 THEN ROUND((p.unrealized_pnl / (p.quantity * p.avg_price)) * 100, 2)
        ELSE 0
    END AS unrealized_pnl_pct,
    p.realized_pnl,
    p.stop_loss_price,
    p.take_profit_price,
    p.created_at,
    p.updated_at
FROM positions p
JOIN accounts a ON p.account_id = a.id;

-- =============================================================================
-- VIEW: Trade History
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_trade_history AS
SELECT
    t.id,
    t.account_id,
    a.name AS account_name,
    t.stock_code,
    t.stock_name,
    t.trade_type,
    t.quantity,
    t.price,
    t.total_amount,
    t.fees,
    t.tax,
    t.total_amount + COALESCE(t.fees, 0) + COALESCE(t.tax, 0) AS total_cost,
    t.realized_pnl,
    t.trade_date,
    t.trade_time,
    t.strategy_id,
    t.order_source,
    t.notes,
    t.created_at
FROM trades t
JOIN accounts a ON t.account_id = a.id;

-- =============================================================================
-- VIEW: Active Monitoring Strategies
-- =============================================================================
CREATE VIEW IF NOT EXISTS vw_active_strategies AS
SELECT
    ms.id,
    ms.account_id,
    a.name AS account_name,
    ms.stock_code,
    ms.strategy_type,
    ms.strategy_config,
    ms.status,
    ms.alert_threshold,
    ms.check_interval,
    ms.last_checked_at,
    ms.last_triggered_at,
    ms.total_triggers,
    ms.created_at,
    ms.updated_at,
    CASE
        WHEN ms.last_checked_at IS NULL THEN 'NEVER_CHECKED'
        WHEN (julianday('now') - julianday(ms.last_checked_at)) * 86400 > ms.check_interval THEN 'OVERDUE'
        ELSE 'OK'
    END AS check_status
FROM monitoring_strategies ms
LEFT JOIN accounts a ON ms.account_id = a.id
WHERE ms.status = 'ACTIVE';

-- =============================================================================
-- INITIAL DATA: Create default simulation account
-- =============================================================================
INSERT INTO accounts (name, initial_capital, current_capital, frozen_capital, status, settings)
VALUES ('Default Simulation Account', 1000000.00, 1000000.00, 0.00, 'ACTIVE',
        '{"currency": "HKD", "commission_rate": 0.0025, "min_commission": 25, "tax_rate": 0.001}');
