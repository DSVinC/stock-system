-- Position Signals Table Migration
-- Created: 2026-03-23
-- Task: TASK_POSITION_MONITOR_001

CREATE TABLE IF NOT EXISTS position_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  ts_code TEXT NOT NULL,
  stock_name TEXT NOT NULL,
  signal_type TEXT NOT NULL,  -- 'WARNING' | 'SELL' | 'BUY'
  signal_level TEXT NOT NULL, -- 'LOW' | 'MEDIUM' | 'HIGH'
  reason TEXT NOT NULL,
  factor_score_before REAL,
  factor_score_after REAL,
  score_drop_rate REAL,
  negative_news_count INTEGER,
  black_swan_events TEXT,  -- JSON array
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read INTEGER DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES portfolio_account(id)
);

CREATE INDEX IF NOT EXISTS idx_signals_stock ON position_signals(ts_code);
CREATE INDEX IF NOT EXISTS idx_signals_account ON position_signals(account_id);
CREATE INDEX IF NOT EXISTS idx_signals_created ON position_signals(created_at);
CREATE INDEX IF NOT EXISTS idx_signals_unread ON position_signals(is_read) WHERE is_read = 0;
