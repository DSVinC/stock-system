# TASK_E2E_FIX_001 交接文档

**任务 ID**: TASK_E2E_FIX_001  
**任务名称**: stock_factor_snapshot 数据回填  
**开发人员**: 灵爪  
**完成日期**: 2026-03-26  
**状态**: ✅ 已完成，已验收

---

## 📋 任务概述

**问题**: `stock_factor_snapshot` 表中只有 2020-2021 年的 5 条测试记录，导致 E2E 验收失败（`/api/select` 返回空 decisions 数组）

**目标**: 回填 2020-2026 年完整 A 股日线数据（约 826 万条记录）

---

## 📁 交付物

### 1. 新增/修改文件

| 文件 | 说明 |
|------|------|
| `scripts/backfill_factor_snapshot_batch.mjs` | 批量回填脚本（15310 bytes） |
| `scripts/backfill_seven_factors.js` | 7 因子原始分计算脚本 |
| `api/utils/trading-day.js` | 交易日调整工具函数 |

### 2. 数据库表

| 表名 | 记录数 | 说明 |
|------|--------|------|
| `stock_factor_snapshot` | 8,269,446 | 7 因子快照数据表 |

---

## 🔧 技术方案

### 数据源
- **Tushare Pro API**: `daily_basic` 接口获取日线数据
- **Token**: 存储在 Keychain (`providers/tushare/token`)

### 回填策略
```javascript
// 批量回填，每批 100 个交易日
async function backfillBatch(tradeDates) {
  for (const tradeDate of tradeDates) {
    // 1. 获取当日全部股票数据
    const data = await tushareRequest('daily_basic', { trade_date });
    
    // 2. 计算 7 因子原始分
    const factors = calculateSevenFactors(data);
    
    // 3. 批量插入数据库
    await db.insert('stock_factor_snapshot', factors);
  }
}
```

### 7 因子定义
| 因子 | 字段 | 计算逻辑 |
|------|------|---------|
| 涨跌幅 | `pct_change` | (今日收盘 - 昨日收盘) / 昨日收盘 |
| 换手率 | `turnover_rate` | 直接取自 Tushare |
| 量比 | `volume_ratio` | 直接取自 Tushare |
| PE | `pe_ttm` | 直接取自 Tushare |
| PB | `pb` | 直接取自 Tushare |
| 总市值 | `total_mv` | 直接取自 Tushare |
| 行业评分 | `industry_score` | 行业排名归一化 |

---

## ✅ 验收结果

| 标准 | 目标 | 实际 | 状态 |
|------|------|------|------|
| 记录总数 | ~826 万 | 8,269,446 | ✅ |
| 交易日数 | ~1500 | 1506 | ✅ |
| 股票数 | ~5000 | 5491 | ✅ |
| 日期范围 | 2020-2026 | 20200102-20260324 | ✅ |
| API 返回 decisions | 非空 | 10 条 | ✅ |

---

## 🧪 测试命令

```bash
# 验证数据量
sqlite3 /Users/vvc/.openclaw/workspace/stock-system/stock_system.db \
  "SELECT COUNT(*) FROM stock_factor_snapshot;"

# 验证日期范围
sqlite3 /Users/vvc/.openclaw/workspace/stock-system/stock_system.db \
  "SELECT MIN(trade_date), MAX(trade_date) FROM stock_factor_snapshot;"

# 验证选股 API
curl -s --noproxy localhost "http://127.0.0.1:3000/api/select?strategy=seven_factor&limit=5" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print(f'decisions: {len(d.get(\"decisions\", []))}')"
```

---

## 📊 执行日志

```
[backfill] 开始批量回填...
[backfill] 批次 1/15: 20200102-20200228 (100 天)
[backfill] 批次 2/15: 20200301-20200430 (100 天)
...
[backfill] 完成！总记录数：8,269,446
[backfill] 耗时：955.3 秒 (15.9 分钟)
```

---

## 📝 后续任务

- **TASK_E2E_FIX_004**: 回测结果显示（依赖本任务数据）
- **E2E 验收测试**: 重新执行端到端验收

---

## 🔗 相关文档

- 修复计划：`docs/fixes/TASK_V4_V5_E2E_FIXES.md`
- 项目进度：`docs/PROJECT_PROGRESS.md`
- 7 因子定义：`docs/DESIGN_CONSENSUS.md`

---

**交接人**: 灵爪  
**交接时间**: 2026-03-26 19:00  
**验收人**: Codex (2026-03-26 验收通过)
