-- stock_minute 表创建脚本
-- 联合主键：(ts_code, trade_time)
-- 数据类型：价格用 DECIMAL，时间用 TEXT ISO8601

CREATE TABLE IF NOT EXISTS stock_minute (
    ts_code VARCHAR(20) NOT NULL,
    trade_time TEXT NOT NULL,
    trade_date TEXT NOT NULL,
    open DECIMAL(10,4),
    high DECIMAL(10,4),
    low DECIMAL(10,4),
    close DECIMAL(10,4),
    volume BIGINT,
    amount DECIMAL(20,4),
    PRIMARY KEY (ts_code, trade_time)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS idx_minute_time ON stock_minute(trade_time);
CREATE INDEX IF NOT EXISTS idx_minute_code ON stock_minute(ts_code);
CREATE INDEX IF NOT EXISTS idx_minute_time_code ON stock_minute(trade_time, ts_code);
CREATE INDEX IF NOT EXISTS idx_minute_trade_date ON stock_minute(trade_date);

-- 回滚脚本
-- DROP INDEX IF EXISTS idx_minute_time;
-- DROP INDEX IF EXISTS idx_minute_code;
-- DROP INDEX IF EXISTS idx_minute_time_code;
-- DROP INDEX IF EXISTS idx_minute_trade_date;
-- DROP TABLE IF EXISTS stock_minute;
