-- 分析报告存储表
-- 用于存储个股分析报告的决策意见（止损/止盈/建仓区间等）
-- 支持条件单从报告导入功能

CREATE TABLE IF NOT EXISTS stock_analysis_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id TEXT UNIQUE NOT NULL,
    stock_code TEXT NOT NULL,
    stock_name TEXT,
    report_json TEXT NOT NULL,
    decision TEXT,
    rating INTEGER,
    stop_loss REAL,
    stop_profit TEXT,
    entry_zone TEXT,
    add_position TEXT,
    key_events TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_code ON stock_analysis_reports(stock_code);
CREATE INDEX IF NOT EXISTS idx_created_at ON stock_analysis_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_report_id ON stock_analysis_reports(report_id);
