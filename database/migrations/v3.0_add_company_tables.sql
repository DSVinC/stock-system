-- Company Events and Stocks Tables Migration
-- Created: 2026-03-24
-- Task: TASK_V3_DB_FIX_001
-- Purpose: Support black swan detection and sentiment factor calculation

-- =============================================================================
-- COMPANY_EVENTS TABLE
-- Stores company announcements and news events
-- =============================================================================
CREATE TABLE IF NOT EXISTS company_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL,           -- Stock code (e.g., 000001.SZ)
  stock_name TEXT NOT NULL,        -- Stock name
  event_type TEXT NOT NULL,        -- Event type (announcement/news/financial etc.)
  event_time DATETIME NOT NULL,    -- Event timestamp
  title TEXT NOT NULL,             -- Event title
  content TEXT,                    -- Event content
  source TEXT,                     -- Data source
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for company_events
CREATE INDEX IF NOT EXISTS idx_company_events_ts_code ON company_events(ts_code);
CREATE INDEX IF NOT EXISTS idx_company_events_event_time ON company_events(event_time);
CREATE INDEX IF NOT EXISTS idx_company_events_type ON company_events(event_type);

-- =============================================================================
-- STOCKS TABLE
-- Stores basic stock information
-- =============================================================================
CREATE TABLE IF NOT EXISTS stocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL UNIQUE,    -- Stock code (e.g., 000001.SZ)
  stock_name TEXT NOT NULL,        -- Stock name
  list_status TEXT,                -- Listing status (L=Listed/D=Delisted/P=Paused)
  special_treatment TEXT,          -- Special treatment status (*ST/ST/Normal)
  industry_code_l1 TEXT,           -- Level 1 industry code
  industry_name_l1 TEXT,           -- Level 1 industry name
  industry_code_l2 TEXT,           -- Level 2 industry code
  industry_name_l2 TEXT,           -- Level 2 industry name
  industry_code_l3 TEXT,           -- Level 3 industry code
  industry_name_l3 TEXT,           -- Level 3 industry name
  list_date DATE,                  -- Listing date
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for stocks
CREATE INDEX IF NOT EXISTS idx_stocks_ts_code ON stocks(ts_code);
CREATE INDEX IF NOT EXISTS idx_stocks_industry ON stocks(industry_name_l1);
CREATE INDEX IF NOT EXISTS idx_stocks_list_status ON stocks(list_status);
CREATE INDEX IF NOT EXISTS idx_stocks_special_treatment ON stocks(special_treatment);

-- =============================================================================
-- TRIGGER: Update stocks.updated_at
-- =============================================================================
CREATE TRIGGER IF NOT EXISTS trg_stocks_updated_at
AFTER UPDATE ON stocks
BEGIN
    UPDATE stocks SET updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.id;
END;