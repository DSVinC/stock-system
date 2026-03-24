# TASK_V3_202: stock_minute 表设计

**优先级**: P1  
**工期**: 0.5 天  
**阶段**: Phase 2（网格交易回测）

---

## 📋 任务描述

设计并创建 stock_minute 表，用于存储 A 股分钟线数据。

---

## 🎯 验收标准

### 表结构要求
- [ ] 包含所有必要字段（ts_code, trade_time, open, high, low, close, volume, amount）
- [ ] 主键设计合理（ts_code + trade_time 联合主键）
- [ ] 索引优化（按时间查询、按股票代码查询）
- [ ] 数据类型正确（价格用 DECIMAL，时间用 DATETIME）

### 迁移脚本
- [ ] 创建迁移文件 `db/migrations/008_create_stock_minute_table.sql`
- [ ] 包含回滚脚本（DROP TABLE）
- [ ] 迁移可重复执行（IF NOT EXISTS）

---

## 📁 交付物

- `db/migrations/008_create_stock_minute_table.sql` - 分钟线表迁移脚本

---

## 📐 表结构参考

```sql
CREATE TABLE IF NOT EXISTS stock_minute (
    ts_code VARCHAR(20) NOT NULL,
    trade_time DATETIME NOT NULL,
    open DECIMAL(10,4),
    high DECIMAL(10,4),
    low DECIMAL(10,4),
    close DECIMAL(10,4),
    volume BIGINT,
    amount DECIMAL(20,4),
    PRIMARY KEY (ts_code, trade_time)
);

CREATE INDEX idx_minute_time ON stock_minute(trade_time);
CREATE INDEX idx_minute_code ON stock_minute(ts_code);
```
