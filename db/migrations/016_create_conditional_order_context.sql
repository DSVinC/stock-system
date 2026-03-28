-- Migration 016: Create conditional_order_context table
-- Date: 2026-03-27
-- Purpose: Side table for storing strategy context associated with conditional orders
-- Task: TASK_FLOW_REFACTOR_006C2A

CREATE TABLE IF NOT EXISTS conditional_order_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conditional_order_id INTEGER NOT NULL UNIQUE,

    -- Strategy identity fields
    strategy_source TEXT,                -- 'strategy_config' | 'template' | 'backtest_result'
    strategy_config_id INTEGER,          -- ID from strategy_configs table
    strategy_config_name TEXT,           -- Name of the strategy config
    template_id INTEGER,                 -- ID from strategy template
    template_name TEXT,                  -- Name of the strategy template

    -- Additional strategy context (allow null for now)
    strategy_id TEXT,                    -- Unique strategy identifier (nullable)
    strategy_version TEXT,               -- Strategy version (nullable)
    report_id TEXT,                      -- Analysis report ID (nullable)

    -- Metadata
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),

    -- Foreign key constraint
    CONSTRAINT fk_conditional_order_context_order
        FOREIGN KEY (conditional_order_id) REFERENCES conditional_order(id)
        ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_conditional_order_context_order_id
    ON conditional_order_context(conditional_order_id);
CREATE INDEX IF NOT EXISTS idx_conditional_order_context_strategy_config
    ON conditional_order_context(strategy_config_id);
CREATE INDEX IF NOT EXISTS idx_conditional_order_context_template
    ON conditional_order_context(template_id);