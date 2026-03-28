# TASK_V4_FIX_001 - 修复选股时点未生效问题

**创建时间**: 2026-03-25 20:30  
**优先级**: P0 (阻塞发布)  
**阶段**: V4 修复  
**状态**: in_progress

---

## 📋 问题描述

**现象**: 测试了 2024、2023、2022 三年的 1 月 1 日，选股结果一模一样  
**根因**: `GET /api/select` 接口没有接收日期参数，总是使用最新数据

---

## 🔍 技术分析

### 当前实现

**前端** (`backtest.html` 第 2272-2295 行):
```javascript
const date = document.getElementById('selectionDate').value || document.getElementById('startDate').value;
params.set('date', date);
const response = await fetch(`/api/select?${params.toString()}`);
```

**后端** (`api/select.js` 第 353-365 行):
```javascript
router.get('/', async (_req, res) => {
  try {
    res.json(await buildSelectionPayload());  // ❌ 没有接收 req.query
  } catch (error) {
    ...
  }
});
```

### 需要修改

1. **后端**: `buildSelectionPayload(date)` 支持日期参数，使用历史快照数据
2. **前端**: 确保 `selectionDate` 正确传递

---

## 🎯 验收标准

- [ ] 修改 `GET /api/select` 接收 `date` 查询参数
- [ ] 修改 `buildSelectionPayload(date)` 使用历史数据
- [ ] 使用 `stock_factor_snapshot` 表的历史数据（按 `trade_date` 筛选）
- [ ] 测试：2024-01-01、2023-01-01、2022-01-01 的选股结果不同
- [ ] 无日期参数时默认使用最新数据

---

## 📐 技术方案

### 方案 A: 使用历史快照数据（推荐）

```javascript
// api/select.js
router.get('/', async (req, res) => {  // 注意：需要接收 req
  try {
    const date = req.query.date;  // YYYY-MM-DD
    res.json(await buildSelectionPayload(date));
  } catch (error) {
    ...
  }
});

async function buildSelectionPayload(date) {
  const datasets = await getSelectionDatasets(date);  // 修改：支持日期参数
  ...
}
```

### 数据获取逻辑

```javascript
// 有日期参数：使用历史快照
const factorSnapshot = db.prepare(`
  SELECT ts_code, score, pe, pb, ps, roc, mom, rps, atlas_score
  FROM stock_factor_snapshot
  WHERE trade_date = ?
`).all(dateStamp);

// 无日期参数：使用最新数据
const factorSnapshot = db.prepare(`
  SELECT ts_code, score, pe, pb, ps, roc, mom, rps, atlas_score
  FROM stock_factor_snapshot
  WHERE trade_date = (SELECT MAX(trade_date) FROM stock_factor_snapshot)
`).all();
```

---

## 📁 需要修改的文件

- `api/select.js` - 接收日期参数，使用历史快照数据
- `backtest.html` - 确认 `selectionDate` 正确传递（可能无需修改）

---

## 🔗 依赖关系

- 依赖：`stock_factor_snapshot` 表已回填（✅ 已完成）

---

## 📝 备注

问题 1/5 - 这是最关键的修复，解决未来函数问题
