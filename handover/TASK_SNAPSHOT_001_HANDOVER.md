# TASK_SNAPSHOT_001 交接文档

## 📋 任务概述
- **任务ID**: TASK_SNAPSHOT_001
- **任务名称**: 创建 stock_factor_snapshot 表
- **执行时间**: 2026-03-24 01:47 (GMT+8)
- **状态**: ✅ 已完成

## 🎯 验收标准完成情况

| 验收标准 | 状态 | 验证结果 |
|----------|------|----------|
| 表结构完整 | ✅ 完成 | 表包含所有17个必需字段 |
| 索引创建 | ✅ 完成 | 创建了3个索引，包括trade_date+ts_code复合索引 |
| 测试插入 | ✅ 完成 | 可正常插入和查询，唯一约束生效 |

## 📊 表结构详情

### 表名
`stock_factor_snapshot`

### 字段清单
1. `trade_date` TEXT NOT NULL - 快照日期 (YYYY-MM-DD)
2. `ts_code` TEXT NOT NULL - 股票代码 (000858.SZ)
3. `industry` TEXT - 行业
4. `policy_score` REAL - 政策支持评分 (0-10)
5. `commercialization_score` REAL - 商业化显现评分 (0-10)
6. `sentiment_score` REAL - 舆论热度/市场关注度 (0-10)
7. `capital_score` REAL - 资本认可评分 (0-10)
8. `roe` REAL - ROE（最新财报）
9. `revenue_growth` REAL - 营收增速
10. `netprofit_growth` REAL - 净利润增速
11. `pe_ttm` REAL - PE(TTM)
12. `pb` REAL - PB
13. `rsi` REAL - RSI(14)
14. `macd_signal` TEXT - MACD 信号
15. `main_flow_in` REAL - 主力净流入 (万元)
16. `industry_total_score` REAL - 行业总分 (0-10)
17. `seven_factor_score` REAL - 7 因子总分 (0-10)
18. `created_at` TEXT DEFAULT CURRENT_TIMESTAMP - 创建时间

### 约束
- `UNIQUE(trade_date, ts_code)` - 唯一约束，防止重复快照

### 索引
1. `idx_trade_date_code` - 复合索引 (trade_date + ts_code)
2. `idx_code` - 单字段索引 (ts_code)
3. `sqlite_autoindex_stock_factor_snapshot_1` - 唯一约束的自动索引

## 🔧 执行详情

### 迁移脚本位置
`/Users/vvc/.openclaw/workspace/stock-system/db/migrations/001_create_snapshot_table.sql`

### 数据库路径
`/Volumes/SSD500/openclaw/stock-system/stock_system.db`

### 执行步骤
1. ✅ 创建 SQL 迁移脚本
2. ✅ 执行迁移，创建表（使用 `CREATE TABLE IF NOT EXISTS`）
3. ✅ 验证表结构（字段、索引）
4. ✅ 测试插入和查询
5. ✅ 验证唯一约束

### 测试数据验证
插入了两条测试记录：
1. `000858.SZ` - 白酒行业，各项评分正常
2. `600519.SH` - 白酒行业，各项评分正常

唯一约束验证：尝试插入重复的 `(trade_date, ts_code)` 组合失败，约束生效。

## 📝 使用示例

```sql
-- 插入新记录
INSERT INTO stock_factor_snapshot (
    trade_date, ts_code, industry,
    policy_score, commercialization_score, sentiment_score, capital_score,
    roe, revenue_growth, netprofit_growth, pe_ttm, pb, rsi, macd_signal, main_flow_in,
    industry_total_score, seven_factor_score
) VALUES (
    '2026-03-25', '000001.SZ', '银行',
    6.5, 5.8, 4.2, 7.1,
    12.3, 8.5, 9.2, 6.8, 0.8, 45.0, 'neutral', 800.0,
    5.9, 6.2
);

-- 查询指定日期的所有记录
SELECT * FROM stock_factor_snapshot WHERE trade_date = '2026-03-24';

-- 查询特定股票的历史快照
SELECT * FROM stock_factor_snapshot WHERE ts_code = '000858.SZ' ORDER BY trade_date;

-- 查询行业评分最高的股票
SELECT 
    trade_date,
    ts_code,
    industry,
    industry_total_score,
    seven_factor_score
FROM stock_factor_snapshot 
WHERE trade_date = '2026-03-24'
ORDER BY industry_total_score DESC, seven_factor_score DESC
LIMIT 10;
```

## 🔗 关联任务

- **下一步任务**: TASK_SNAPSHOT_002 (创建 policy_events 表)
- **关联任务**: TASK_SNAPSHOT_003 (创建 stock_selection_reports 表)

## 📚 注意事项

1. **数据完整性**: 表使用 `UNIQUE(trade_date, ts_code)` 约束，确保每个股票每天只有一个快照
2. **索引优化**: 已创建复合索引 `(trade_date, ts_code)`，适合按日期查询和按股票查询
3. **时间格式**: `trade_date` 使用 `YYYY-MM-DD` 格式，`created_at` 使用 SQLite 默认时间戳
4. **评分范围**: 所有评分字段建议使用 0-10 范围，便于统一比较

## ✅ 交接清单

- [x] 迁移脚本已创建并验证
- [x] 表结构正确无误
- [x] 索引已创建
- [x] 数据插入和查询测试通过
- [x] 唯一约束验证通过
- [x] 交接文档已生成

---

**交接人**: 灵爪 (OpenClaw Subagent)  
**交接时间**: 2026-03-24 01:47 (GMT+8)  
**验证状态**: ✅ 任务完成，可进行下一步开发