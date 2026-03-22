# TASK_P0_003 - 因子快照库模块

**优先级**: P0  
**状态**: ✅ 已完成  
**创建时间**: 2026-03-22 19:15  
**负责人**: 灵爪  

---

## 📋 任务概述

实现因子快照记录模块，记录每日决策时的 7 因子原始数据，用于后续回测和量化自迭代。

---

## 🎯 目标

1. 记录每日每只股票的 7 因子原始分
2. 记录因子权重配置
3. 记录最终决策（买入/卖出/持有）
4. 记录风险警告和黑天鹅检测结果
5. 支持按日期、股票代码查询

---

## 📐 设计方案

### 存储位置
- **目录**：`data/factor-snapshots/`
- **文件命名**：`YYYY-MM-DD.json`（按天归档）

### 数据结构
```json
{
  "timestamp": "2026-03-22T18:30:00",
  "stockCode": "300308.SZ",
  "factors": {
    "trend": 0.95,
    "momentum": 0.88,
    "valuation": 0.72,
    "capital": 0.65,
    "earnings": 0.83,
    "volatility": 0.78,
    "sentiment": 0.92
  },
  "weights": {
    "trend": 0.17,
    "momentum": 0.15,
    "valuation": 0.15,
    "capital": 0.13,
    "earnings": 0.13,
    "volatility": 0.10,
    "sentiment": 0.15
  },
  "weightedScore": 0.85,
  "decision": "买入",
  "confidence": 0.88,
  "riskWarnings": ["减持公告"],
  "blackSwanCheck": false
}
```

---

## 📁 交付物

- [ ] `api/factor-snapshot.js` - 因子快照记录模块
- [ ] `data/factor-snapshots/` - 快照目录

---

## ✅ 验收标准

1. **记录快照**：`recordSnapshot(snapshotData)` 能正确记录因子快照
2. **查询快照**：`querySnapshot(stockCode, date)` 能查询指定日期的快照
3. **批量查询**：`querySnapshotsByDate(date)` 能查询某日所有股票的快照
4. **文件管理**：
   - ✅ 按天归档（YYYY-MM-DD.json）
   - ✅ 支持追加模式（同一股票一天多次分析）
   - ✅ 自动创建目录
5. **数据完整性**：
   - ✅ 包含 7 因子原始分
   - ✅ 包含权重配置
   - ✅ 包含决策结果
   - ✅ 包含风险警告

---

## 🧪 测试命令

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node -e "
const snapshot = require('./api/factor-snapshot.js');
const data = {
  timestamp: new Date().toISOString(),
  stockCode: '300308.SZ',
  factors: { trend: 0.9, momentum: 0.8, valuation: 0.7, capital: 0.6, earnings: 0.8, volatility: 0.7, sentiment: 0.9 },
  weights: { trend: 0.17, momentum: 0.15, valuation: 0.15, capital: 0.13, earnings: 0.13, volatility: 0.10, sentiment: 0.15 },
  weightedScore: 0.82,
  decision: '买入',
  confidence: 0.85,
  riskWarnings: [],
  blackSwanCheck: false
};
snapshot.recordSnapshot(data).then(() => console.log('记录成功'));
"
```

---

## 🔗 相关文件

- 实现：`api/factor-snapshot.js`
- 存储：`data/factor-snapshots/`

---

## 📝 实现说明

- 使用 JSON 文件存储（便于人工检查和版本控制）
- 支持按日期归档
- 后续可考虑使用 SQLite 优化查询性能
