# TASK_ANALYZE_STRUCT_004 - 方向股列表界面适配 v2 数据

**优先级**: P0  
**负责人**: Claude Code  
**验收人**: Codex  
**监督人**: 灵爪  
**创建时间**: 2026-03-22 11:16  
**修正时间**: 2026-03-22 12:12（目标页面修正为 analysis.html）
**完成时间**: 2026-03-22 12:35 (Codex 验收)
**复核时间**: 2026-03-25 11:30 (灵爪)
**预计完成**: 2026-03-22 17:00  
**依赖**: TASK_ANALYZE_STRUCT_002, TASK_ANALYZE_STRUCT_003 完成
**状态**: ✅ 已完成  

---

## 📋 任务描述

改造 `stock-system/analysis.html` 的方向股列表界面，使用 v2 结构化数据显示操作建议，确保与分析报告一致。

**注意**: 目标页面是 `analysis.html`，不是 `select.html`。`select.html` 是行业选择页，`analysis.html` 是个股分析结果页。

---

## 🎯 验收标准

### 1. 数据获取
- [x] 使用 `/api/v2/analyze/report` 接口获取数据
- [x] 正确解析 `strategies.balanced.actions` 结构
- [x] 显示操作建议（买入价、仓位、止损）

### 2. 界面显示
- [x] 方向股列表显示股票评分（report_score）
- [x] 显示操作建议摘要（从 summary_text 获取）
- [x] 显示关键价格（买入价、止损价、仓位）

### 3. 交互功能
- [x] 点击"查看报告"正确跳转
- [x] 点击"导入条件单"调用条件单界面（后续任务）

---

## 🔧 实施步骤

### Step 1: 修改方向股列表数据获取

**文件**: `stock-system/analysis.html` (JavaScript 部分)

```javascript
// 原逻辑（v1）
async function fetchStockAnalysis(tsCode) {
  const response = await fetch(`/api/analyze/report?ts_code=${tsCode}`);
  const result = await response.json();
  return result.data;
}

// 新逻辑（v2）
async function fetchStockAnalysis(tsCode) {
  const response = await fetch(`/api/v2/analyze/report?ts_code=${tsCode}`);
  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result.data;
}
```

### Step 2: 修改方向股卡片渲染

```javascript
// 原逻辑（v1）
function renderStockCard(stock) {
  return `
    <div class="stock-card">
      <h3>${stock.stock_name} (${stock.stock_code})</h3>
      <p>评分：${stock.report_score}/5</p>
      <p>建议：${stock.strategies.balanced}</p>
      <button onclick="viewReport('${stock.stock_code}')">查看报告</button>
    </div>
  `;
}

// 新逻辑（v2）
function renderStockCard(stock) {
  const strategy = stock.strategies.balanced;
  const firstAction = strategy.actions[0];
  const buyPrice = firstAction?.trigger_conditions?.[0]?.value || 'N/A';
  const stopLoss = firstAction?.stop_loss || 'N/A';
  const position = firstAction?.position_percent || 0;
  
  return `
    <div class="stock-card">
      <h3>${stock.stock_name} (${stock.stock_code})</h3>
      <div class="score">评分：${stock.report_score}/5</div>
      <div class="decision">决策：${stock.decision}</div>
      <div class="summary">${strategy.summary_text}</div>
      <div class="key-prices">
        <span>买入价：¥${buyPrice}</span>
        <span>止损价：¥${stopLoss}</span>
        <span>仓位：${position}%</span>
      </div>
      <div class="actions">
        <button onclick="viewReport('${stock.stock_code}')">查看报告</button>
        <button onclick="importToConditional('${stock.stock_code}', 'balanced')" class="btn-import">
          导入条件单
        </button>
      </div>
    </div>
  `;
}
```

### Step 3: 添加导入条件单功能（预留接口）

```javascript
// 导入条件单功能（为后续任务预留）
async function importToConditional(tsCode, riskType) {
  try {
    // 获取策略数据
    const response = await fetch(`/api/v2/analyze/strategy/${tsCode}/${riskType}`);
    const result = await response.json();
    
    if (!result.success) {
      alert('获取策略失败：' + result.error);
      return;
    }
    
    // 跳转到条件单界面，传递策略数据
    const strategyData = encodeURIComponent(JSON.stringify(result.data));
    window.location.href = `/conditional.html?import=${strategyData}`;
  } catch (error) {
    console.error('导入失败:', error);
    alert('导入失败：' + error.message);
  }
}
```

### Step 4: 添加 CSS 样式

```css
/* 方向股卡片样式优化 */
.stock-card {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 16px;
  margin: 12px 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.stock-card .score {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--text-primary);
}

.stock-card .decision {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  background: var(--primary-color);
  color: white;
  margin: 8px 0;
}

.stock-card .summary {
  color: var(--text-secondary);
  margin: 12px 0;
  line-height: 1.5;
}

.stock-card .key-prices {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 12px 0;
  font-size: 0.9em;
}

.stock-card .actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.stock-card .btn-import {
  background: var(--success-color);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.stock-card .btn-import:hover {
  opacity: 0.9;
}
```

---

## ✅ 验收检查清单

- [x] 方向股列表正确显示评分
- [x] 显示操作建议摘要（summary_text）
- [x] 显示关键价格（买入价、止损价、仓位）
- [x] "查看报告"按钮正常跳转
- [x] "导入条件单"按钮预留接口
- [x] 样式符合设计规范（暗色主题）
- [x] Git 提交规范（feat(ui): 方向股列表适配 v2 数据）
- [x] Codex 验收通过（2026-03-22 12:35，4/5 通过）
  - 导入功能属于后续任务 `TASK_CONDITIONAL_IMPORT_001`

---

## 🔗 相关文档

- Schema 文档：`/Users/vvc/.openclaw/workspace/stock-system/docs/schema/analyzer-output-v2.md`
- 上游任务：`TASK_ANALYZE_STRUCT_002`, `TASK_ANALYZE_STRUCT_003`

---

_🐾 灵爪监督于 2026-03-22 11:16_
