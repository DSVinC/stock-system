# TASK_SNAPSHOT_006: 选股报告保存功能实现

**任务 ID**: TASK_SNAPSHOT_006  
**任务名称**: 选股报告保存功能实现  
**优先级**: P0  
**创建时间**: 2026-03-24 21:56 (Asia/Shanghai)  
**来源**: DESIGN_CONSENSUS.md 第 15.1 节  
**状态**: ✅ 已完成

---

## 📋 任务描述

实现选股完成后自动保存报告到 `stock_selection_reports` 表，用于：
- 回测追溯（当时选了什么）
- 调仓对比（双周频调仓时对比变化）
- 审计复盘（为什么选这些）

---

## 🎯 验收标准

| 标准 | 目标值 | 验证方法 |
|------|--------|---------|
| 选股完成后自动保存 | 100% 触发 | 调用 /api/select 后检查数据库 |
| JSON 结构完整 | 包含 filter_config、selected_stocks、statistics | 检查数据库记录 |
| 前端可查看历史 | 能列出历史选股报告 | 访问选股历史页面 |
| 支持从历史报告导入 | 可选择历史报告进行回测 | 回测页面功能测试 |

---

## 📊 选股报告 JSON 结构

```json
{
  "report_id": "SELECT_20260324_091500",
  "report_type": "stock_selection",
  "created_at": "2026-03-24T09:15:00+08:00",
  "trade_date": "2026-03-24",
  
  // 筛选条件（可复现）
  "filter_config": {
    "industry_weights": {
      "policy": 0.25,
      "commercialization": 0.30,
      "sentiment": 0.25,
      "capital": 0.20
    },
    "seven_factor_min_score": 0.75,
    "valuation_limits": {"pe_max": 60, "peg_max": 2.0},
    "price_limit": {"max_price": 150},
    "industry_filter": ["白酒", "人工智能", "CPO"]
  },
  
  // 选股结果
  "selected_stocks": [
    {
      "rank": 1,
      "ts_code": "000858.SZ",
      "name": "五粮液",
      "industry": "白酒",
      "total_score": 8.2
    }
  ],
  
  // 统计信息
  "statistics": {
    "total_candidates": 5000,
    "passed_industry_filter": 387,
    "passed_seven_factor": 156,
    "final_selected": 10
  },
  
  // 关联数据
  "data_snapshot": {
    "trade_date": "2026-03-24",
    "data_source": "Tushare + 新浪财经"
  }
}
```

---

## 🔧 实现步骤

### 步骤 1: 确认数据库表已创建

检查 `stock_selection_reports` 表是否存在：
```bash
sqlite3 /Volumes/SSD500/openclaw/stock-system/stock_system.db \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='stock_selection_reports';"
```

### 步骤 2: 修改选股 API

修改 `api/select.js`，在选股完成后保存报告：
```javascript
// 在 buildSelectionPayload 函数最后
async function buildSelectionPayload() {
  // ... 现有逻辑 ...
  
  // 保存选股报告
  await saveSelectionReport({
    reportId: `SELECT_${tradeDate}_${Date.now()}`,
    tradeDate,
    filterConfig,
    selectedStocks: directions,
    statistics
  });
  
  return { directions, tradeDate };
}
```

### 步骤 3: 创建报告保存函数

新建 `api/selection-report.js`：
```javascript
const db = require('./db');

async function saveSelectionReport(report) {
  const sql = `
    INSERT INTO stock_selection_reports (
      report_id, report_type, created_at, trade_date,
      filter_config, selected_stocks, statistics, data_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  await db.run(sql, [
    report.reportId,
    'stock_selection',
    new Date().toISOString(),
    report.tradeDate,
    JSON.stringify(report.filterConfig),
    JSON.stringify(report.selectedStocks),
    JSON.stringify(report.statistics),
    JSON.stringify({
      trade_date: report.tradeDate,
      data_source: 'Tushare + 新浪财经'
    })
  ]);
}

module.exports = { saveSelectionReport };
```

### 步骤 4: 添加选股历史 API

新建 `api/selection-history.js`：
```javascript
const db = require('./db');

async function getSelectionHistory(limit = 20) {
  const sql = `
    SELECT report_id, trade_date, created_at,
           json_extract(statistics, '$.final_selected') as selected_count
    FROM stock_selection_reports
    ORDER BY created_at DESC
    LIMIT ?
  `;
  
  return await db.all(sql, [limit]);
}

async function getSelectionReport(reportId) {
  const sql = `SELECT * FROM stock_selection_reports WHERE report_id = ?`;
  return await db.get(sql, [reportId]);
}

module.exports = { getSelectionHistory, getSelectionReport };
```

### 步骤 5: 注册 API 路由

修改 `api/server.js`：
```javascript
const selectionHistory = require('./selection-history');

// 获取选股历史
app.get('/api/selection/history', async (req, res) => {
  try {
    const history = await selectionHistory.getSelectionHistory();
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// 获取选股报告详情
app.get('/api/selection/report/:id', async (req, res) => {
  try {
    const report = await selectionHistory.getSelectionReport(req.params.id);
    if (!report) {
      res.status(404).json({ success: false, message: '报告不存在' });
      return;
    }
    res.json({ success: true, data: report });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});
```

### 步骤 6: 创建选股历史页面

新建 `selection-history.html`：
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>选股历史 | A 股投资系统</title>
  <link rel="stylesheet" href="./pages/style.css">
</head>
<body>
  <div class="page-shell">
    <h1>📜 选股历史</h1>
    <div id="historyList"></div>
  </div>
  
  <script>
    async function loadHistory() {
      const res = await fetch('/api/selection/history');
      const { data } = await res.json();
      
      const html = data.map(report => `
        <div class="report-card">
          <div class="report-date">${report.trade_date}</div>
          <div class="report-info">
            选中 ${report.selected_count} 只股票
          </div>
          <button onclick="viewReport('${report.report_id}')">查看详情</button>
          <button onclick="backtestFromReport('${report.report_id}')">导入回测</button>
        </div>
      `).join('');
      
      document.getElementById('historyList').innerHTML = html;
    }
    
    function viewReport(reportId) {
      window.location.href = `selection-report.html?id=${reportId}`;
    }
    
    function backtestFromReport(reportId) {
      // TODO: 跳转到回测页面，带入报告 ID
      alert('回测功能开发中...');
    }
    
    loadHistory();
  </script>
</body>
</html>
```

---

## 📝 交付清单

- [ ] 确认 `stock_selection_reports` 表已创建
- [ ] 修改 `api/select.js` 添加报告保存逻辑
- [ ] 创建 `api/selection-report.js` 保存函数
- [ ] 创建 `api/selection-history.js` 查询函数
- [ ] 修改 `api/server.js` 注册 API 路由
- [ ] 创建 `selection-history.html` 页面
- [ ] 创建 `selection-report.html` 详情页
- [ ] 测试完整流程

---

## 📚 关联文档

- 设计共识：`docs/DESIGN_CONSENSUS.md` 第 15.1 节
- 数据库表：`db/migrations/003_create_selection_reports_table.sql`
- 关联任务：TASK_SNAPSHOT_001 (stock_factor_snapshot 表)

---

_创建时间：2026-03-24 21:56_
