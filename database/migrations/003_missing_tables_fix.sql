-- =============================================================================
-- Migration: 003_missing_tables_fix
-- Description: Create missing tables for portfolio and conditional order system
-- Created: 2026-03-22
-- =============================================================================

-- Enable foreign key support
PRAGMA foreign_keys = ON;

-- =============================================================================
-- PORTFOLIO_ACCOUNT TABLE
-- Stores portfolio account information (for conditional order system)
-- =============================================================================
CREATE TABLE IF NOT EXISTS portfolio_account (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    account_name    VARCHAR(100) NOT NULL,
    initial_cash    DECIMAL(15, 4) NOT NULL DEFAULT 1000000.0000,
    current_cash    DECIMAL(15, 4) NOT NULL DEFAULT 1000000.0000,
    total_value     DECIMAL(15, 4) NOT NULL DEFAULT 1000000.0000,
    total_return    DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
    return_rate     DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_initial_cash CHECK (initial_cash >= 0),
    CONSTRAINT chk_current_cash CHECK (current_cash >= 0),
    CONSTRAINT chk_total_value CHECK (total_value >= 0)
);

-- Portfolio account indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_account_created_at ON portfolio_account(created_at);

-- =============================================================================
-- CONDITIONAL_ORDER TABLE
-- Stores conditional orders for automatic trading
-- =============================================================================
CREATE TABLE IF NOT EXISTS conditional_order (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id        INTEGER NOT NULL,
    ts_code           VARCHAR(20) NOT NULL,
    stock_name        VARCHAR(100) NOT NULL,
    action            VARCHAR(10) NOT NULL,  -- 'buy' or 'sell'
    order_type        VARCHAR(20) NOT NULL,  -- 'quantity', 'amount', 'position_percent'
    quantity          INTEGER,
    amount            DECIMAL(15, 4),
    position_percent  DECIMAL(5, 2),
    conditions        TEXT NOT NULL,  -- JSON array of conditions
    status            VARCHAR(20) NOT NULL DEFAULT 'enabled',  -- 'enabled', 'disabled', 'expired', 'completed'
    trigger_count     INTEGER NOT NULL DEFAULT 0,
    max_trigger_count INTEGER DEFAULT 1,
    start_date        DATE,
    end_date          DATE,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_conditional_order_account
        FOREIGN KEY (account_id) REFERENCES portfolio_account(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_action CHECK (action IN ('buy', 'sell')),
    CONSTRAINT chk_order_type CHECK (order_type IN ('quantity', 'amount', 'position_percent')),
    CONSTRAINT chk_status CHECK (status IN ('enabled', 'disabled', 'expired', 'completed')),
    CONSTRAINT chk_trigger_count CHECK (trigger_count >= 0)
);

-- Conditional order indexes
CREATE INDEX IF NOT EXISTS idx_conditional_order_account_id ON conditional_order(account_id);
CREATE INDEX IF NOT EXISTS idx_conditional_order_status ON conditional_order(status);
CREATE INDEX IF NOT EXISTS idx_conditional_order_ts_code ON conditional_order(ts_code);

-- =============================================================================
-- PORTFOLIO_TRADE TABLE
-- Records trades triggered by conditional orders
-- =============================================================================
CREATE TABLE IF NOT EXISTS portfolio_trade (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id            INTEGER NOT NULL,
    ts_code               VARCHAR(20) NOT NULL,
    stock_name            VARCHAR(100) NOT NULL,
    trade_type            VARCHAR(10) NOT NULL,  -- 'BUY' or 'SELL'
    quantity              INTEGER NOT NULL,
    price                 DECIMAL(12, 4) NOT NULL,
    amount                DECIMAL(15, 4) NOT NULL,
    fees                  DECIMAL(12, 4) DEFAULT 0.0000,
    tax                   DECIMAL(12, 4) DEFAULT 0.0000,
    trade_date            DATE NOT NULL,
    trade_time            TIME,
    conditional_order_id  INTEGER,
    remark                TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_portfolio_trade_account
        FOREIGN KEY (account_id) REFERENCES portfolio_account(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_portfolio_trade_conditional_order
        FOREIGN KEY (conditional_order_id) REFERENCES conditional_order(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT chk_trade_type CHECK (trade_type IN ('BUY', 'SELL')),
    CONSTRAINT chk_quantity CHECK (quantity > 0),
    CONSTRAINT chk_price CHECK (price > 0),
    CONSTRAINT chk_amount CHECK (amount > 0)
);

-- Portfolio trade indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_trade_account_id ON portfolio_trade(account_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_trade_conditional_order_id ON portfolio_trade(conditional_order_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_trade_trade_date ON portfolio_trade(trade_date);

-- =============================================================================
-- 创建视图 view_conditional_executions
-- =============================================================================
CREATE VIEW IF NOT EXISTS view_conditional_executions AS
SELECT
    co.id AS order_id,
    co.account_id,
    pa.account_name,
    co.ts_code,
    co.stock_name,
    co.action,
    co.order_type,
    co.status,
    co.trigger_count,
    co.max_trigger_count,
    co.created_at AS order_created_at,
    co.updated_at AS order_updated_at,
    pt.id AS trade_id,
    pt.trade_date,
    pt.quantity,
    pt.price,
    pt.amount,
    pt.remark
FROM conditional_order co
LEFT JOIN portfolio_trade pt ON pt.conditional_order_id = co.id
LEFT JOIN portfolio_account pa ON pa.id = co.account_id;