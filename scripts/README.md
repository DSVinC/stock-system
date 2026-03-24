# 数据回填脚本说明

## backfill_snapshot.py

### 功能
从 Tushare 等数据源获取历史数据，回填到 `stock_factor_snapshot` 表（2020-至今）。

### 快速开始
```bash
# 1. 设置环境变量
export TUSHARE_TOKEN=你的token

# 2. 测试运行
python3 scripts/backfill_snapshot.py --test --stock-limit 5

# 3. 回填最近3个月
python3 scripts/backfill_snapshot.py --start 20260101 --end 20260324

# 4. 全量回填
python3 scripts/backfill_snapshot.py --start 20200101 --end 20260324 --batch-size 50
```

### 数据表结构
```sql
CREATE TABLE stock_factor_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_date TEXT NOT NULL,           -- 交易日
    ts_code TEXT NOT NULL,              -- 股票代码
    industry TEXT,                      -- 行业
    policy_score REAL DEFAULT 0,        -- 政策评分
    commercialization_score REAL DEFAULT 0, -- 商业化评分
    sentiment_score REAL DEFAULT 0,     -- 市场关注度评分
    capital_score REAL DEFAULT 0,       -- 资本认可评分
    roe REAL DEFAULT 0,                 -- ROE
    revenue_growth REAL DEFAULT 0,      -- 营收增速
    netprofit_growth REAL DEFAULT 0,    -- 净利润增速
    pe_ttm REAL DEFAULT 0,              -- PE(TTM)
    pb REAL DEFAULT 0,                  -- PB
    rsi REAL DEFAULT 0,                 -- RSI
    macd_signal REAL DEFAULT 0,         -- MACD信号
    main_flow_in REAL DEFAULT 0,        -- 主力净流入
    industry_total_score REAL DEFAULT 0, -- 行业总分
    seven_factor_score REAL DEFAULT 0,   -- 7因子总分
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_date, ts_code)
);
```

### 性能优化
- 使用 `--batch-size` 控制批次大小
- 内置 API 限流控制
- 支持断点续传
- 详细的日志记录

### 注意事项
1. 需要有效的 Tushare Token
2. 全量回填需要较长时间（~30小时）
3. 建议先测试再批量运行
4. 行业因子部分为框架代码，需要实际数据源接入