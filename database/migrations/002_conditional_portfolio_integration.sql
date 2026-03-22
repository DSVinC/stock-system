-- =============================================================================
-- Migration: 002_conditional_portfolio_integration
-- Description: Add conditional execution view for portfolio integration
-- Created: 2026-03-22
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
