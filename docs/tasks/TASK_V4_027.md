# TASK_V4_027 - 回填 2020 年资金流数据

**创建时间**: 2026-03-25
**优先级**: P1
**阶段**: 阶段 6 - 数据回填（可选）
**状态**: completed
**完成时间**: 2026-03-25

---

## 📋 任务描述

使用 Tushare Pro 回填 2020 年的资金流数据到 stock_moneyflow_snapshot 表。

---

## 🎯 验收标准

- [x] 使用现有批量回填脚本 `scripts/backfill/backfill_moneyflow_batch.js`
- [x] 使用 Tushare Pro 批量接口获取数据
- [x] 回填 2020 年缺失数据（2 个交易日：20200707、20201211）
- [x] 回填 7,926 条记录
- [x] 数据完整性验证通过（243 个交易日完整）
- [x] 实际耗时：0.4 分钟

---

## 📐 技术方案

**数据源**: Tushare Pro（已有 8000 积分权限）

**回填脚本逻辑**:
```javascript
// 1. 获取 2020 年所有交易日
const tradeDays = await getTradeDays('20200101', '20201231');

// 2. 批量获取每天的资金流数据
for (const tradeDay of tradeDays) {
  const data = await tushare.moneyflow(tradeDay);
  await saveToDatabase(data);
}

// 3. 验证数据完整性
const count = await db.query('SELECT COUNT(*) FROM stock_moneyflow_snapshot WHERE trade_date LIKE "2020%"');
console.log(`2020 年数据量：${count}`);
```

---

## 📁 交付物

- `scripts/backfill_moneyflow_2020.mjs`
- 回填日志
- 验证报告

---

## 🔗 依赖关系

- 依赖：Tushare Pro 权限
- 依赖：现有 stock_moneyflow_snapshot 表结构

---

## 📝 备注

设计文档：`docs/design/2026-03-25-backtest-upgrade-consensus.md`

**实际执行结果**:
- 原计划：回填 2020 年全年数据（96.8 万条）
- 实际情况：2020 年数据已基本完整，仅缺失 2 个交易日
- 回填日期：20200707、20201211
- 回填记录：7,926 条
- 耗时：0.4 分钟
- 最终状态：2020 年 243 个交易日数据完整
