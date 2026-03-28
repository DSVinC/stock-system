-- 迁移 010: 创建策略信号表
-- 用于存储策略执行生成的交易信号
-- 关联任务：TASK_STRATEGY_LIB_001_04

CREATE TABLE IF NOT EXISTS strategy_signals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_id TEXT NOT NULL,           -- 策略 ID（如：dual_ma, multi_factor）
    strategy_name TEXT,                   -- 策略名称
    date TEXT NOT NULL,                   -- 交易日期
    ts_code TEXT NOT NULL,                -- 股票代码
    signal TEXT NOT NULL,                 -- 信号类型：BUY/SELL/HOLD
    qty INTEGER DEFAULT 0,                -- 建议数量
    price REAL NOT NULL,                  -- 价格
    score REAL,                           -- 评分
    signal_strength TEXT,                 -- 信号强度：LOW/MEDIUM/HIGH
    metadata TEXT,                        -- 额外元数据（JSON 格式）
    created_at TEXT NOT NULL,             -- 创建时间
    updated_at TEXT                       -- 更新时间
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON strategy_signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_signals_date ON strategy_signals(date);
CREATE INDEX IF NOT EXISTS idx_signals_code ON strategy_signals(ts_code);
CREATE INDEX IF NOT EXISTS idx_signals_created ON strategy_signals(created_at);

-- 注释
-- strategy_id: 策略标识，如 'dual_ma', 'multi_factor'
-- signal: 交易信号，BUY=买入，SELL=卖出，HOLD=持有
-- signal_strength: 信号强度，基于评分或置信度
-- metadata: JSON 格式存储额外信息，如因子得分、均线值等
