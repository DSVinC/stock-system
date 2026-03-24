# TASK_V3_009 修复单

> **修复任务**: TASK_V3_009_FIX_002  
> **创建时间**: 2026-03-24 12:31  
> **优先级**: 🔴 高  
> **验收来源**: `docs/acceptance/TASK_V3_008_V3_009_ACCEPTANCE_REPORT.md`

---

## 🐛 问题描述

验收员发现：前端未同步新 API。`conditional-order.html` 中的 `fetch` 调用仍指向旧的 `/api/analysis/reports/${tsCode}` 接口，而非新实现的 `/api/report/` 系列接口。

---

## 🎯 修复目标

更新 `conditional-order.html` 中的 API 调用，使其使用新的 `/api/report/` 接口。

### 需要修改的接口调用

| 旧 API | 新 API |
|--------|--------|
| `GET /api/analysis/reports/${tsCode}` | `GET /api/report/list?stock_code=${tsCode}` |
| - | `GET /api/report/:stockCode/latest` |
| - | `POST /api/report/:reportId/import-to-order` |

---

## 📝 修复方案

1. 搜索 `conditional-order.html` 中所有 `/api/analysis/reports` 的调用
2. 替换为新的 `/api/report/` 接口
3. 确保"导入选定报告策略"按钮调用正确的 API

---

## ✅ 验收标准

- [x] `conditional-order.html` 中使用 `/api/report/` 接口
- [x] "导入选定报告策略"功能正常工作
- [x] 前端与后端 API 一致

## 修复完成

**修复时间**: 2026-03-24
**修复内容**:
- 将 `loadReports` 函数中的旧 API `/api/analysis/reports/${tsCode}` 替换为新的 `/api/report/list?stock_code=${tsCode}`
- 调整返回数据字段映射：`r.filename` → `r.report_id`，`r.date` → `r.created_at`

---

## 📚 相关文档

- 验收报告：`docs/acceptance/TASK_V3_008_V3_009_ACCEPTANCE_REPORT.md`
- 后端 API：`api/report-storage.js`
