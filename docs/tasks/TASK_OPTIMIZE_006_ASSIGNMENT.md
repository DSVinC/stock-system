# 任务分配单：TASK_OPTIMIZE_006

**任务名称**: 网格参数独立优化 API 稳定化  
**优先级**: P1  
**预计工时**: 1.5h  
**状态**: completed  

---

## 任务描述

修复 `POST /api/grid-optimizer/run` 在默认请求下的崩溃问题（`Cannot read properties of undefined (reading 'totalReturn')`），保证网格参数优化链路可以稳定返回结果。

## 实现内容

1. 在 `api/server.js` 确认并挂载 `/api/grid-optimizer` 路由。
2. 修复 `api/grid-optimizer.js` 的权重配置覆盖问题：
   - 新增默认权重常量与归一化函数 `normalizeObjectiveWeights(...)`。
   - 构造器改为统一归一化 `objectiveWeights`，避免 `undefined` 覆盖默认值。
   - API 入参改为仅在 `objectiveWeights` 有效时才传入。
3. `calculateScore(...)` 增加空值保护，避免异常输入导致打分崩溃。

## 验收标准

- [x] `GET /api/grid-optimizer/parameters` 可正常返回参数空间
- [x] `POST /api/grid-optimizer/run` 不再报 `totalReturn` 读取错误
- [x] 返回 `success=true` 且 `successCount>=1`（最小参数组合）
- [x] 三保险文档完成同步

## 相关文件

- `api/grid-optimizer.js`
- `api/server.js`
- `docs/runtime/TASK_OPTIMIZE_006_STATUS.md`

---

**创建时间**: 2026-04-01  
**创建者**: Codex
