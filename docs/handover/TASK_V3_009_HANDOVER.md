# TASK_V3_009 交接文档

> **任务名称**: 条件单重构（基于分析报告决策）  
> **交接时间**: 2026-03-24 12:22  
> **交出方**: 灵爪（项目经理）  
> **接手方**: 验收员（Gemini CLI）

---

## 📋 任务概述

将条件单与个股分析报告的决策意见关联，实现"从分析报告导入条件单"功能。

---

## 📦 交付物清单

| # | 文件 | 说明 | 状态 |
|---|------|------|------|
| 1 | `api/report-storage.js` | 分析报告存储 API（15KB） | ✅ 完成 |
| 2 | `api/conditional-order.js` | 条件单 API 改造（29KB） | ✅ 完成 |
| 3 | `conditional-order.html` | 前端 UI 改造 | ✅ 完成 |
| 4 | `api/monitor-conditional.js` | 触发逻辑改造（18KB） | ✅ 完成 |
| 5 | `db/migrations/005_create_analysis_reports_table.sql` | 数据库表 | ✅ 完成 |
| 6 | `api/server.js` | API 路由集成 | ✅ 完成 |

---

## 🔌 核心接口

### 1. 分析报告存储 API

```javascript
// 存储报告
POST /api/report/store
{
  "stock_code": "300519.SZ",
  "report_json": {...}
}

// 获取报告列表
GET /api/report/list?stock_code=300519.SZ&limit=10

// 获取最新报告
GET /api/report/:stockCode/latest

// 从报告导入条件单
POST /api/report/:reportId/import-to-order
{
  "account_id": 1,
  "position_pct": 20
}
```

### 2. 条件单从报告导入

```javascript
// 从报告创建条件单
POST /api/conditional-order/create-from-report
{
  "report_id": "report_123",
  "account_id": 1,
  "options": {
    "position_pct": 20,
    "quantity": null,
    "amount": null
  }
}
```

### 3. 报告关联功能

```javascript
// 获取条件单关联的报告
const report = await getAssociatedReport(orderId);

// 检查条件单与报告决策一致性
const isConsistent = checkReportDecision(order, report);

// 更新报告状态
await updateReportStatus(reportId, 'triggered');
```

---

## ✅ 验收标准

- [ ] 分析报告可存储和查询
- [ ] 条件单可从报告一键导入
- [ ] 导入的条件单包含止损/止盈/建仓等决策
- [ ] 前端界面友好（选择股票→读取报告→确认生成）
- [ ] 条件单触发逻辑正确（关联报告决策）

---

## 🧪 测试建议

### 1. 单元测试
```bash
node --check api/report-storage.js
node --check api/conditional-order.js
node --check api/monitor-conditional.js
```

### 2. API 测试
```bash
# 存储报告
curl -X POST http://localhost:3000/api/report/store \
  -H "Content-Type: application/json" \
  -d '{"stock_code":"300519.SZ","report_json":{...}}'

# 从报告导入条件单
curl -X POST http://localhost:3000/api/conditional-order/create-from-report \
  -H "Content-Type: application/json" \
  -d '{"report_id":"report_123","account_id":1}'
```

### 3. 前端测试
1. 打开 `conditional-order.html`
2. 选择一只股票
3. 点击"导入选定报告策略"按钮
4. 确认条件单生成

---

## ⚠️ 注意事项

1. **数据库依赖**: 需要 `stock_analysis_reports` 表
2. **报告格式**: 分析报告 JSON 需符合 DESIGN_CONSENSUS.md 第四节规范
3. **条件单类型**: 支持止损单、止盈单、建仓单三种类型

---

## 📝 已知问题

无

---

## 📚 相关文档

- 任务文档：`docs/tasks/TASK_V3_009.md`
- 状态文档：`docs/runtime/TASK_V3_009_STATUS.md`
- 项目经验：`docs/PROJECT_LESSONS.md`
- 报告格式规范：`docs/DESIGN_CONSENSUS.md`
