-- =============================================================================
-- Migration: 001_initial
-- Description: Initial data seeding for simulation account system
-- Created: 2026-03-19
-- =============================================================================

-- =============================================================================
-- SEED DATA: Default Simulation Account
-- =============================================================================
INSERT OR IGNORE INTO accounts (
    id,
    name,
    initial_capital,
    current_capital,
    frozen_capital,
    status,
    settings,
    created_at,
    updated_at
) VALUES (
    1,
    'Default Simulation Account',
    1000000.00,
    1000000.00,
    0.00,
    'ACTIVE',
    '{
        "currency": "HKD",
        "commission_rate": 0.0025,
        "min_commission": 25,
        "tax_rate": 0.001,
        "max_position_pct": 0.2,
        "default_stop_loss_pct": 0.05,
        "default_take_profit_pct": 0.10
    }',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- =============================================================================
-- SEED DATA: Sample Monitoring Strategies
-- =============================================================================
INSERT OR IGNORE INTO monitoring_strategies (
    account_id,
    stock_code,
    strategy_type,
    strategy_config,
    status,
    alert_threshold,
    check_interval,
    total_triggers,
    created_at,
    updated_at
) VALUES
-- Price-based monitoring example
(
    1,
    '00700',
    'PRICE_THRESHOLD',
    '{
        "condition": "BELOW",
        "target_price": 380.00,
        "notification_channels": ["email", "webhook"]
    }',
    'ACTIVE',
    380.00,
    60,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
-- Volume-based monitoring example
(
    1,
    '09988',
    'VOLUME_SPIKE',
    '{
        "condition": "ABOVE_AVERAGE",
        "multiplier": 2.0,
        "time_window": "1d"
    }',
    'PAUSED',
    NULL,
    300,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
-- Technical indicator monitoring example
(
    1,
    '03690',
    'TECHNICAL_INDICATOR',
    '{
        "indicator": "RSI",
        "period": 14,
        "condition": "BELOW",
        "threshold": 30
    }',
    'ACTIVE',
    30.00,
    60,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- =============================================================================
-- SEED DATA: System Configuration
-- =============================================================================
-- Create a system settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT,
    description TEXT,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO system_settings (key, value, description) VALUES
('db_version', '1', 'Database schema version'),
('simulation_enabled', 'true', 'Enable simulation trading'),
('default_commission_rate', '0.0025', 'Default commission rate for trades'),
('min_commission', '25', 'Minimum commission per trade'),
('tax_rate', '0.001', 'Transaction tax rate'),
('max_position_alert_pct', '0.80', 'Alert when position reaches this percentage of portfolio'),
('default_check_interval', '60', 'Default monitoring check interval in seconds');

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
