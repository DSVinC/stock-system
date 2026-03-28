-- 创建行业因子、资金流快照表
-- 迁移脚本：009_create_factor_moneyflow_tables.sql
-- 创建时间：2026-03-24
-- 用途：为回测系统创建历史快照表

-- 1. 行业因子快照表
CREATE TABLE IF NOT EXISTS industry_factor_snapshot (
    trade_date TEXT NOT NULL,           -- 快照日期 (YYYY-MM-DD)
    industry_code TEXT NOT NULL,        -- 行业代码 (如: 880001)
    industry_name TEXT NOT NULL,        -- 行业名称 (如: 白酒)
    
    -- 4 维度行业筛选因子
    policy_score REAL,                  -- 政策支持评分 (0-10)
    commercialization_score REAL,       -- 商业化显现评分 (0-10)
    sentiment_score REAL,               -- 舆论热度/市场关注度 (0-10)
    capital_score REAL,                 -- 资本认可评分 (0-10)
    
    -- 行业统计数据
    avg_pe REAL,                        -- 行业平均 PE
    avg_pb REAL,                        -- 行业平均 PB
    avg_pct_change REAL,                -- 行业平均涨跌幅
    total_market_cap REAL,              -- 行业总市值 (亿元)
    
    -- 综合评分
    total_score REAL,                   -- 行业综合评分 (0-10)
    rank_by_score INTEGER,              -- 按综合评分排名
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_date, industry_code)
);

-- 2. 个股资金流快照表
CREATE TABLE IF NOT EXISTS stock_moneyflow_snapshot (
    trade_date TEXT NOT NULL,           -- 交易日期 (YYYY-MM-DD)
    ts_code TEXT NOT NULL,              -- 股票代码 (000858.SZ)
    stock_name TEXT,                    -- 股票名称
    
    -- 资金流数据
    net_mf_amount REAL,                 -- 主力净流入 (万元)
    buy_lg_amount REAL,                 -- 大单买入 (万元)
    sell_lg_amount REAL,                -- 大单卖出 (万元)
    buy_elg_amount REAL,                -- 特大单买入 (万元)
    sell_elg_amount REAL,               -- 特大单卖出 (万元)
    
    -- 行情数据
    pct_change REAL,                    -- 涨跌幅 (%)
    close_price REAL,                   -- 收盘价
    volume REAL,                        -- 成交量 (手)
    amount REAL,                        -- 成交额 (万元)
    
    -- 行业关联
    industry_code TEXT,                 -- 行业代码
    industry_name TEXT,                 -- 行业名称
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_date, ts_code)
);

-- 3. 行业资金流快照表
CREATE TABLE IF NOT EXISTS industry_moneyflow_snapshot (
    trade_date TEXT NOT NULL,           -- 交易日期 (YYYY-MM-DD)
    industry_code TEXT NOT NULL,        -- 行业代码
    industry_name TEXT NOT NULL,        -- 行业名称
    
    -- 聚合资金流
    net_mf_amount REAL,                 -- 行业净流入合计 (万元)
    buy_lg_amount REAL,                 -- 行业大单买入合计 (万元)
    sell_lg_amount REAL,                -- 行业大单卖出合计 (万元)
    buy_elg_amount REAL,                -- 行业特大单买入合计 (万元)
    sell_elg_amount REAL,               -- 行业特大单卖出合计 (万元)
    
    -- 统计数据
    avg_pct_change REAL,                -- 行业平均涨跌幅 (%)
    stock_count INTEGER,                -- 成分股数量
    inflow_stock_count INTEGER,         -- 净流入股票数量
    outflow_stock_count INTEGER,        -- 净流出股票数量
    
    -- 排名
    rank_by_net_mf INTEGER,             -- 按净流入排名
    rank_by_avg_pct_change INTEGER,     -- 按平均涨跌幅排名
    
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_date, industry_code)
);

-- 创建索引

-- industry_factor_snapshot 索引
CREATE INDEX IF NOT EXISTS idx_industry_factor_date ON industry_factor_snapshot(trade_date);
CREATE INDEX IF NOT EXISTS idx_industry_factor_code ON industry_factor_snapshot(industry_code);
CREATE INDEX IF NOT EXISTS idx_industry_factor_score ON industry_factor_snapshot(total_score DESC);

-- stock_moneyflow_snapshot 索引
CREATE INDEX IF NOT EXISTS idx_stock_mf_date ON stock_moneyflow_snapshot(trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_mf_code ON stock_moneyflow_snapshot(ts_code);
CREATE INDEX IF NOT EXISTS idx_stock_mf_industry ON stock_moneyflow_snapshot(industry_code);
CREATE INDEX IF NOT EXISTS idx_stock_mf_net_mf ON stock_moneyflow_snapshot(net_mf_amount DESC);

-- industry_moneyflow_snapshot 索引
CREATE INDEX IF NOT EXISTS idx_industry_mf_date ON industry_moneyflow_snapshot(trade_date);
CREATE INDEX IF NOT EXISTS idx_industry_mf_code ON industry_moneyflow_snapshot(industry_code);
CREATE INDEX IF NOT EXISTS idx_industry_mf_net_mf ON industry_moneyflow_snapshot(net_mf_amount DESC);

-- 创建视图

-- 最新行业因子排名视图
CREATE VIEW IF NOT EXISTS v_latest_industry_factor_rank AS
SELECT 
    trade_date,
    industry_code,
    industry_name,
    policy_score,
    commercialization_score,
    sentiment_score,
    capital_score,
    total_score,
    rank_by_score,
    avg_pe,
    avg_pb,
    avg_pct_change
FROM industry_factor_snapshot
WHERE trade_date = (SELECT MAX(trade_date) FROM industry_factor_snapshot)
ORDER BY total_score DESC;

-- 最新行业资金流排名视图
CREATE VIEW IF NOT EXISTS v_latest_industry_mf_rank AS
SELECT 
    trade_date,
    industry_code,
    industry_name,
    net_mf_amount,
    avg_pct_change,
    rank_by_net_mf,
    rank_by_avg_pct_change,
    stock_count,
    inflow_stock_count,
    outflow_stock_count
FROM industry_moneyflow_snapshot
WHERE trade_date = (SELECT MAX(trade_date) FROM industry_moneyflow_snapshot)
ORDER BY net_mf_amount DESC;