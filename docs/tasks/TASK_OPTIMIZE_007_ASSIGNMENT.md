# 任务分配单：TASK_OPTIMIZE_007

**任务名称**: Walk-Forward 分析 API 化与执行前置校验  
**优先级**: P2  
**预计工时**: 2h  
**状态**: completed  

---

## 任务描述

将现有 Walk-Forward 能力从脚本调用升级为后端 API 调用入口，并在执行前增加数据库结构前置校验，避免“长时间运行后才失败”。

## 已完成内容

1. 新增 API 路由（`api/walk-forward-analyzer.js`）：
   - `POST /api/walk-forward/run`
   - `GET /api/walk-forward/config`
2. 新增服务挂载（`api/server.js`）：
   - `app.use('/api/walk-forward', ...)`
3. 新增前置校验：
   - 检查 `stock_factor_snapshot` 必需列：`ts_code/trade_date/factor_score/pe_ttm/peg`
   - 缺列时直接返回 `422` 和修复指引（不再假运行）

## 验收结果

1. `/api/walk-forward/config` 可正常返回默认配置与策略选项。
2. `/api/walk-forward/run` 已可执行并返回完整分析结果（含 `conclusion`）。
3. 已完成 `stock_factor_snapshot.peg` 列补齐与历史回填，前置校验通过。

## 相关文件

- `api/walk-forward-analyzer.js`
- `api/server.js`
- `docs/runtime/TASK_OPTIMIZE_007_STATUS.md`

---

**创建时间**: 2026-04-01  
**创建者**: Codex
