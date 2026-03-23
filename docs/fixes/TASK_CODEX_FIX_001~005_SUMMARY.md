# TASK_CODEX_FIX_001~005 修复总结

## 📋 修复概述

**修复日期**: 2026-03-23  
**触发原因**: PR #4 合并后，Codex 第二次审查发现 5 个遗留问题  
**修复范围**: 4 个 API 文件，5 个问题修复

---

## 🔍 问题清单

| # | 任务 ID | 文件 | 问题类型 | 严重级别 |
|---|---------|------|----------|----------|
| 1 | TASK_CODEX_FIX_001 | `api/analyze.js` | ReferenceError | 🔴 高 |
| 2 | TASK_CODEX_FIX_002 | `api/portfolio.js` | 逻辑错误 | 🔴 高 |
| 3 | TASK_CODEX_FIX_003 | `api/monitor.js` | API 方法错误 | 🟡 中 |
| 4 | TASK_CODEX_FIX_004 | `api/backtest.js` | 功能缺失 | 🟡 中 |
| 5 | TASK_CODEX_FIX_005 | `api/backtest.js` | 字段名错误 | 🟡 中 |

---

## 🔧 修复详情

### TASK_CODEX_FIX_001: analyze.js ReferenceError 修复

**问题描述**:  
`calculateCompositeScore()` 调用时使用了未定义的 `stockCode` 变量，导致 API 报错。

**根因分析**:  
变量命名不一致，函数参数使用 `ts_code`，但调用时使用 `stockCode`。

**修复方案**:  
将 `stockCode` 改为 `basicInfo.ts_code`。

**代码变更**:
```javascript
// 修复前
const compositeScore = calculateCompositeScore(stockCode, factors);

// 修复后
const compositeScore = calculateCompositeScore(basicInfo.ts_code, factors);
```

**验证**: `node --check api/analyze.js` ✅ 通过

---

### TASK_CODEX_FIX_002: portfolio.js 清仓损益修复

**问题描述**:  
清仓 API 将 `current_cash` 重置为 `initial_cash`，丢弃了已实现损益。

**根因分析**:  
清仓逻辑未计算卖出所得，直接重置现金。

**修复方案**:  
计算清仓所得总额（数量 × 价格），更新 `current_cash` = 原有现金 + 清仓所得。

**代码变更**:
```javascript
// 修复前
account.current_cash = account.initial_cash;

// 修复后
const sellValue = position.quantity * currentPrice;
account.current_cash = account.current_cash + sellValue;
```

**验证**: `node --check api/portfolio.js` ✅ 通过

---

### TASK_CODEX_FIX_003: monitor.js DB 方法修复

**问题描述**:  
使用 `db.all()` callback 方法而非 `db.allPromise()` promise 方法，导致 async/await 失效。

**根因分析**:  
sqlite3 库的 callback API 与 promise API 混用。

**修复方案**:  
将所有 `db.all()` 调用替换为 `db.allPromise()`。

**代码变更**:
```javascript
// 修复前
const signals = await db.all(`SELECT * FROM position_signals WHERE ...`, params);

// 修复后
const signals = await db.allPromise(`SELECT * FROM position_signals WHERE ...`, params);
```

**验证**: `node --check api/monitor.js` ✅ 通过

---

### TASK_CODEX_FIX_004: backtest.js 年化收益修复

**问题描述**:  
`calculateMetrics()` 未计算 `annualizedReturn`，报告显示 NaN%。

**根因分析**:  
指标计算函数遗漏年化收益率公式。

**修复方案**:  
添加年化收益率计算：`(1 + returnRate)^(365/days) - 1`

**代码变更**:
```javascript
// 新增代码
const startDate = new Date(this.config.startDate);
const endDate = new Date(this.config.endDate);
const days = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
this.metrics.annualizedReturn = Math.pow(1 + this.metrics.returnRate, 365 / days) - 1;
```

**验证**: `node --check api/backtest.js` ✅ 通过

---

### TASK_CODEX_FIX_005: backtest.js 字段名修复

**问题描述**:  
报告模板使用 `trade.qty` 而非 `trade.quantity`，金额显示 NaN。

**根因分析**:  
字段命名不一致，数据对象使用 `quantity`，模板使用 `qty`。

**修复方案**:  
HTML 和 Markdown 模板中所有 `trade.qty` 改为 `trade.quantity`。

**代码变更**:
```javascript
// 修复前 (HTML 模板)
<td>¥${(trade.qty * trade.price).toLocaleString()}</td>

// 修复后
<td>¥${(trade.quantity * trade.price).toLocaleString()}</td>

// 修复前 (Markdown 模板)
`| ... | ¥${(trade.qty * trade.price).toLocaleString()} |`

// 修复后
`| ... | ¥${(trade.quantity * trade.price).toLocaleString()} |`
```

**验证**: `node --check api/backtest.js` ✅ 通过

---

## ✅ 验证结果

### 1. 语法检查
```bash
node --check api/analyze.js    # ✅
node --check api/portfolio.js  # ✅
node --check api/monitor.js    # ✅
node --check api/backtest.js   # ✅
```

### 2. API 测试
```bash
# 测试 monitor.js 修复
curl http://localhost:3000/api/monitor/overview
# 响应：{"success":true,"data":{"positionCount":3,"todaySignals":0,...}} ✅

# 测试 analyze.js 修复
curl "http://localhost:3000/api/analyze?ts_code=300308.SZ"
# 响应：正常返回分析数据 ✅
```

### 3. 服务器状态
- 服务运行于：http://127.0.0.1:3000
- 进程状态：正常
- 日志：无错误

---

## 📁 修改文件清单

1. `api/analyze.js` - 1 处变量名修复
2. `api/portfolio.js` - 清仓逻辑修复
3. `api/monitor.js` - 2 处 DB 方法调用修复
4. `api/backtest.js` - 年化收益计算 + 2 处字段名修复

---

## 📝 文档更新

- [x] `docs/tasks/TASK_CODEX_FIX_001.md` ~ `005.md`
- [x] `docs/runtime/TASK_CODEX_FIX_001_STATUS.md` ~ `005_STATUS.md`
- [x] `docs/handover/TASK_CODEX_FIX_001_HANDOVER.md` ~ `005_HANDOVER.md`
- [x] `docs/fixes/TASK_CODEX_FIX_001~005_SUMMARY.md`（本文档）
- [x] `docs/acceptance/TASK_CODEX_FIX_001~005_ACCEPTANCE.md`
- [x] `todo.db` - 5 个任务标记为 done

---

## 💡 经验教训

### 问题分类
- **命名不一致**: 2 起（stockCode/qty）
- **逻辑错误**: 1 起（清仓损益）
- **API 使用错误**: 1 起（db.all vs db.allPromise）
- **功能遗漏**: 1 起（年化收益）

### 根本原因
1. **代码审查不充分**: PR #4 合并前未经过完整验收
2. **测试覆盖不足**: 缺少端到端 API 测试
3. **命名规范不统一**: 字段名在不同模块不一致

### 预防措施
1. ✅ 所有 PR 必须经过 Codex 完整审查后才能合并
2. ✅ 关键 API 必须编写集成测试
3. ✅ 建立字段命名规范文档，统一数据模型

---

## 📊 状态同步

| 系统 | 状态 | 更新时间 |
|------|------|----------|
| docs/runtime/ | ✅ 已更新 | 2026-03-23 12:05 |
| todo.db | ✅ 已同步 | 2026-03-23 12:05 |
| Git | ⏳ 待提交 | - |
| PR | ⏳ 待创建 | - |

---

## 🎯 下一步

1. 提交代码到 Git
2. 创建 PR #5
3. 请求 Codex 审查
4. 审查通过后合并到 main
