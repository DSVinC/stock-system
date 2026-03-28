# TASK_SNAPSHOT_005: 执行历史数据回填

已基于真实数据库、迁移脚本、回填脚本证据确认完成；详细证据见 docs/runtime/TASK_SNAPSHOT_001-005_STATUS.md。

**任务 ID**: TASK_SNAPSHOT_005  
**任务名称**: 执行历史数据回填  
**优先级**: P0  
**创建时间**: 2026-03-24  
**预计工作量**: 30-60 分钟  
**状态**: 已完成（done）

---

## 📋 任务描述

执行 `scripts/backfill_snapshot.py` 脚本，回填 2020-01-01 至 2026-03-24 的历史数据到 `stock_factor_snapshot` 表。

---

## 🎯 验收标准

| 标准 | 目标值 | 验证方法 |
|------|--------|---------|
| 数据完整性 | 2020-01-01 至 2026-03-24 所有交易日 | SQL 统计 |
| 股票覆盖 | 全部 A 股（~5000 只） | SQL 统计 |
| 因子计算 | 4 维度 +7 因子全部有值 | 抽样检查 |
| 执行时间 | <60 分钟 | 运行计时 |
| 错误处理 | 网络异常可重试 | 日志检查 |

---

## 📊 回填数据范围

| 维度 | 范围 |
|------|------|
| **时间** | 2020-01-01 至 2026-03-24 |
| **股票** | 全部 A 股（~5000 只） |
| **频率** | 每个交易日 |
| **预计数据量** | ~5000 股 × 1500 交易日 ≈ 750 万条 |

---

## 💡 执行步骤

### 步骤 1: 小规模测试（1 个月）

```bash
cd /Users/vvc/.openclaw/workspace/stock-system

# 先测试最近 1 个月
python3 scripts/backfill_snapshot.py \
  --start 20260201 \
  --end 20260324 \
  --batch-size 10
```

### 步骤 2: 验证测试数据

```bash
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db <<EOF
-- 检查数据量
SELECT trade_date, COUNT(*) as stock_count
FROM stock_factor_snapshot
WHERE trade_date >= '20260201'
GROUP BY trade_date
ORDER BY trade_date DESC
LIMIT 10;

-- 检查因子值
SELECT trade_date, ts_code, industry_total_score, seven_factor_score
FROM stock_factor_snapshot
WHERE trade_date = '20260324'
LIMIT 5;
EOF
```

### 步骤 3: 全量回填（2020-至今）

```bash
# 全量回填，分批处理（每批 50 个交易日）
python3 scripts/backfill_snapshot.py \
  --start 20200101 \
  --end 20260324 \
  --batch-size 50 \
  --log-file logs/backfill_$(date +%Y%m%d_%H%M%S).log
```

### 步骤 4: 验证全量数据

```bash
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db <<EOF
-- 总数据量
SELECT COUNT(*) as total_records FROM stock_factor_snapshot;

-- 日期范围
SELECT MIN(trade_date) as first_date, MAX(trade_date) as last_date
FROM stock_factor_snapshot;

-- 每日股票数量（应接近 5000）
SELECT trade_date, COUNT(*) as stock_count
FROM stock_factor_snapshot
GROUP BY trade_date
ORDER BY trade_date DESC
LIMIT 20;

-- 因子值统计
SELECT 
  AVG(industry_total_score) as avg_industry_score,
  AVG(seven_factor_score) as avg_seven_score,
  AVG(roe) as avg_roe,
  AVG(pe_ttm) as avg_pe
FROM stock_factor_snapshot;
EOF
```

---

## ⚠️ 注意事项

1. **Tushare Token**: 确保环境变量 `TUSHARE_TOKEN` 已设置
2. **API 限流**: 脚本内置限流控制，但仍需注意调用频率
3. **内存使用**: 分批处理避免内存溢出
4. **错误处理**: 单个股票失败不影响整体流程
5. **断点续传**: 支持从中断点继续执行

---

## 📚 关联文档

- 脚本文件：`scripts/backfill_snapshot.py`
- 任务文档：`docs/tasks/TASK_SNAPSHOT_004.md`
- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.2 节

---

_创建时间：2026-03-24_
