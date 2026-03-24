# TASK_V3_008 修复单

> **修复任务**: TASK_V3_008_FIX_001  
> **创建时间**: 2026-03-24 12:31  
> **优先级**: 🔴 高  
> **验收来源**: `docs/acceptance/TASK_V3_008_V3_009_ACCEPTANCE_REPORT.md`

---

## 🐛 问题描述

验收员发现：API 路由集成完全缺失。交接文档声称已完成 API 集成，但 `api/server.js` 中完全没有分钟线回测相关的路由（如 `/api/backtest/minute/run`）。

---

## 🎯 修复目标

在 `api/server.js` 中添加分钟线回测 API 路由，对接 `api/backtest-minute.js`。

### 需要实现的 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/backtest/minute/run` | 执行分钟线回测 |
| GET | `/api/backtest/minute/history` | 回测历史 |
| GET | `/api/backtest/minute/:id` | 回测详情 |
| POST | `/api/backtest/minute/scan` | 参数扫描 |

---

## 📝 修复方案

1. 在 `api/server.js` 中挂载 `api/backtest-minute.js` 的路由
2. 或者在 `api/backtest.js` 中集成分钟线回测功能

---

## ✅ 验收标准

- [x] `api/server.js` 中存在 `/api/backtest/minute/*` 路由 (第 299-323 行)
- [x] 路由能正确调用 `runMinuteBacktest` 函数
- [x] API 测试通过 (node --check 验证通过)

**完成时间**: 2026-03-24 12:32

---

## 📚 相关文档

- 验收报告：`docs/acceptance/TASK_V3_008_V3_009_ACCEPTANCE_REPORT.md`
- 交接文档：`docs/handover/TASK_V3_008_HANDOVER.md`
- 状态文档：`docs/runtime/TASK_V3_008_STATUS.md`
