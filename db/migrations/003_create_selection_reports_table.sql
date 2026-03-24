-- 选股报告存储表
-- 创建时间：2026-03-24
-- 用途：存储选股阶段产生的报告，支持回测追溯和调仓对比

-- 删除旧表（如有）
DROP TABLE IF EXISTS stock_selection_reports;

-- 创建表
CREATE TABLE stock_selection_reports (
    report_id TEXT PRIMARY KEY,
    report_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    filter_config TEXT NOT NULL,
    selected_stocks TEXT NOT NULL,
    statistics TEXT,
    data_snapshot TEXT,
    created_by TEXT DEFAULT 'system'
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_trade_date ON stock_selection_reports(trade_date);
CREATE INDEX IF NOT EXISTS idx_created_at ON stock_selection_reports(created_at);

-- 插入示例数据
INSERT INTO stock_selection_reports VALUES
(
    'SELECT_20260324_091500',
    'stock_selection',
    '2026-03-24T09:15:00+08:00',
    '2026-03-24',
    '{"industry_weights": {"policy": 0.25, "commercialization": 0.30, "sentiment": 0.25, "capital": 0.20}, "seven_factor_min_score": 0.75, "valuation_limits": {"pe_max": 60, "peg_max": 2.0}, "price_limit": {"max_price": 150}, "industry_filter": ["白酒", "人工智能", "CPO"]}',
    '[{"rank": 1, "ts_code": "000858.SZ", "name": "五粮液", "industry": "白酒", "total_score": 8.2}, {"rank": 2, "ts_code": "000568.SZ", "name": "泸州老窖", "industry": "白酒", "total_score": 7.9}, {"rank": 3, "ts_code": "300308.SZ", "name": "中际旭创", "industry": "CPO", "total_score": 8.5}]',
    '{"total_candidates": 5000, "passed_industry_filter": 387, "passed_seven_factor": 156, "final_selected": 10}',
    '{"trade_date": "2026-03-24", "data_source": "Tushare + 新浪财经"}',
    'system'
);