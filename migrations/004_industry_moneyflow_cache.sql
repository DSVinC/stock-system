-- 迁移 004: 行业资金流缓存表
-- 创建时间：2026-03-24
-- 用途：缓存个股资金流和行业资金流，避免实时调用 Tushare 接口

-- ============================================
-- 1. 个股资金流表（每天更新）
-- ============================================
CREATE TABLE IF NOT EXISTS stock_moneyflow (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date DATE NOT NULL,
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  net_mf_amount REAL,        -- 主力净流入金额
  buy_lg_amount REAL,        -- 主力买入金额
  sell_lg_amount REAL,       -- 主力卖出金额
  buy_elg_amount REAL,       -- 超大单买入金额
  sell_elg_amount REAL,      -- 超大单卖出金额
  pct_change REAL,           -- 涨跌幅
  volume REAL,               -- 成交量
  amount REAL,               -- 成交额
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trade_date, ts_code)
);

-- 索引：加速按日期查询
CREATE INDEX IF NOT EXISTS idx_moneyflow_date ON stock_moneyflow(trade_date);
-- 索引：加速按日期 + 代码查询
CREATE INDEX IF NOT EXISTS idx_moneyflow_date_code ON stock_moneyflow(trade_date, ts_code);
-- 索引：加速按股票代码查询历史
CREATE INDEX IF NOT EXISTS idx_moneyflow_code ON stock_moneyflow(ts_code, trade_date);

-- ============================================
-- 2. 行业资金流表（聚合计算，每天更新）
-- ============================================
CREATE TABLE IF NOT EXISTS industry_moneyflow (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_date DATE NOT NULL,
  industry_code TEXT NOT NULL,
  industry_name TEXT,
  industry_type TEXT,        -- 'I'=行业，'N'=概念
  net_mf_amount REAL,        -- 行业主力净流入（聚合）
  avg_pct_change REAL,       -- 行业平均涨跌幅
  stock_count INTEGER,       -- 成分股数量
  rank_by_net_mf INTEGER,    -- 按主力净流入排名
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(trade_date, industry_code)
);

-- 索引：加速按日期查询
CREATE INDEX IF NOT EXISTS idx_industry_moneyflow_date ON industry_moneyflow(trade_date);
-- 索引：加速按日期 + 排名查询
CREATE INDEX IF NOT EXISTS idx_industry_moneyflow_date_rank ON industry_moneyflow(trade_date, rank_by_net_mf);

-- ============================================
-- 3. 行业成分股关系表（每周更新）
-- ============================================
CREATE TABLE IF NOT EXISTS industry_member (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  industry_code TEXT NOT NULL,
  industry_name TEXT,
  industry_type TEXT,        -- 'I'=行业，'N'=概念
  ts_code TEXT NOT NULL,
  stock_name TEXT,
  weight REAL,               -- 权重（可选，按市值）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(industry_code, ts_code)
);

-- 索引：加速按行业查询成分股
CREATE INDEX IF NOT EXISTS idx_industry_member_code ON industry_member(industry_code);
-- 索引：加速按股票查所属行业的反向查询
CREATE INDEX IF NOT EXISTS idx_industry_member_stock ON industry_member(ts_code);

-- ============================================
-- 4. 行业指数基本信息表（一次性同步，很少变化）
-- ============================================
CREATE TABLE IF NOT EXISTS industry_index (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_code TEXT NOT NULL UNIQUE,
  name TEXT,
  type TEXT,                 -- 'I'=行业，'N'=概念，'TH'=其他
  count INTEGER,             -- 成分股数量
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引：加速按类型筛选
CREATE INDEX IF NOT EXISTS idx_industry_index_type ON industry_index(type);

-- ============================================
-- 5. 数据同步日志表
-- ============================================
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_type TEXT NOT NULL,   -- 'stock_moneyflow', 'industry_member', 'industry_moneyflow'
  trade_date DATE,
  status TEXT NOT NULL,      -- 'success', 'failed', 'partial'
  records_synced INTEGER,
  error_message TEXT,
  started_at DATETIME NOT NULL,
  finished_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 6. 视图：最新交易日行业资金流排名
-- ============================================
DROP VIEW IF EXISTS v_latest_industry_ranking;
CREATE VIEW v_latest_industry_ranking AS
SELECT 
  imf.trade_date,
  imf.industry_code,
  imf.industry_name,
  imf.industry_type,
  imf.net_mf_amount,
  imf.avg_pct_change,
  imf.stock_count,
  imf.rank_by_net_mf,
  ROW_NUMBER() OVER (ORDER BY imf.net_mf_amount DESC) as rank
FROM industry_moneyflow imf
WHERE imf.trade_date = (SELECT MAX(trade_date) FROM industry_moneyflow)
ORDER BY imf.net_mf_amount DESC;

-- ============================================
-- 7. 视图：个股资金流 + 行业关联
-- ============================================
DROP VIEW IF EXISTS v_stock_moneyflow_with_industry;
CREATE VIEW v_stock_moneyflow_with_industry AS
SELECT 
  smf.trade_date,
  smf.ts_code,
  smf.stock_name,
  smf.net_mf_amount,
  smf.pct_change,
  im.industry_code,
  im.industry_name,
  im.industry_type
FROM stock_moneyflow smf
LEFT JOIN industry_member im ON smf.ts_code = im.ts_code
WHERE smf.trade_date = (SELECT MAX(trade_date) FROM stock_moneyflow);
