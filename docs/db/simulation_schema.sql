PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
    account_id TEXT PRIMARY KEY,
    account_name TEXT NOT NULL,
    initial_capital INTEGER NOT NULL,
    current_cash REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (initial_capital BETWEEN 1 AND 1000000),
    CHECK (CAST(initial_capital AS INTEGER) = initial_capital),
    CHECK (current_cash >= 0)
);

CREATE TABLE IF NOT EXISTS trades (
    trade_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    trade_type TEXT NOT NULL,
    trade_price REAL NOT NULL,
    trade_volume INTEGER NOT NULL,
    trade_amount REAL NOT NULL,
    commission REAL NOT NULL DEFAULT 0,
    tax REAL NOT NULL DEFAULT 0,
    transfer_fee REAL NOT NULL DEFAULT 0,
    total_cost REAL NOT NULL,
    trade_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    triggered_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    CHECK (trade_type IN ('buy', 'sell')),
    CHECK (trade_price > 0),
    CHECK (trade_volume > 0),
    CHECK (trade_amount >= 0),
    CHECK (commission >= 0),
    CHECK (tax >= 0),
    CHECK (transfer_fee >= 0)
);

CREATE TABLE IF NOT EXISTS positions (
    position_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    stock_code TEXT NOT NULL,
    stock_name TEXT,
    hold_volume INTEGER NOT NULL,
    avg_cost REAL NOT NULL,
    current_price REAL NOT NULL DEFAULT 0,
    market_value REAL NOT NULL DEFAULT 0,
    floating_pnl REAL NOT NULL DEFAULT 0,
    floating_pnl_pct REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE,
    UNIQUE (account_id, stock_code),
    CHECK (hold_volume >= 0),
    CHECK (avg_cost >= 0),
    CHECK (current_price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounts_created_at ON accounts(created_at);
CREATE INDEX IF NOT EXISTS idx_trades_account_time ON trades(account_id, trade_time DESC);
CREATE INDEX IF NOT EXISTS idx_trades_stock_code ON trades(stock_code);
CREATE INDEX IF NOT EXISTS idx_positions_account_stock ON positions(account_id, stock_code);

CREATE TRIGGER IF NOT EXISTS trg_accounts_updated_at
AFTER UPDATE ON accounts
FOR EACH ROW
BEGIN
    UPDATE accounts
    SET updated_at = CURRENT_TIMESTAMP
    WHERE account_id = NEW.account_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_positions_updated_at
AFTER UPDATE ON positions
FOR EACH ROW
BEGIN
    UPDATE positions
    SET updated_at = CURRENT_TIMESTAMP
    WHERE position_id = NEW.position_id;
END;

CREATE VIEW IF NOT EXISTS simulation_account AS
SELECT
    account_id,
    account_name,
    initial_capital,
    current_cash AS available_cash,
    COALESCE((
        SELECT SUM(market_value)
        FROM positions p
        WHERE p.account_id = a.account_id
    ), 0) AS total_market_value,
    current_cash + COALESCE((
        SELECT SUM(market_value)
        FROM positions p
        WHERE p.account_id = a.account_id
    ), 0) AS total_assets,
    created_at
FROM accounts a;

CREATE VIEW IF NOT EXISTS simulation_trade AS
SELECT
    trade_id,
    account_id,
    stock_code,
    trade_type,
    trade_price,
    trade_volume,
    trade_amount,
    commission,
    tax,
    total_cost,
    trade_time,
    triggered_by
FROM trades;

CREATE VIEW IF NOT EXISTS simulation_position AS
SELECT
    position_id,
    account_id,
    stock_code,
    stock_name,
    hold_volume,
    avg_cost,
    current_price,
    market_value,
    floating_pnl,
    floating_pnl_pct
FROM positions;
