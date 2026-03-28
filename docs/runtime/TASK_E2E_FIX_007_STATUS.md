# TASK_E2E_FIX_007 实时状态

**任务**: `select.html` 决策单输出修复  
**状态**: done  
**开始时间**: 2026-03-27 08:45  
**负责人**: 项目经理（Codex）→ 开发（Claude Code）→ PR（Gemini）→ 验收（Codex）

## 问题描述

E2E 验收显示：
- `select.html` 能正常渲染行业和股票卡片
- 但 `/api/select` 返回中的 `decisions` 数组为空或不完整
- 当前页验收因此不通过

## 已确认根因

- `api/select.js` 的最新数据路径中，`directions[].picks` 使用的是 `ts_code`
- 决策单生成阶段却读取 `s.code`
- 导致进入决策引擎的股票代码为空，`decisions` 无法正确生成
- `api/market-data.js` 中 `findLatestTradeDate()` 调用了未定义的 `getDb()`
- 最新数据路径在未注入 `TUSHARE_TOKEN` 时直接失败，未降级到快照路径
- 历史快照路径里预加载日期构造错误，触发 `Invalid time value`

## 修复结果

- 已修复最新数据路径的股票代码映射
- 已为 `api/market-data.js` 补齐数据库单例访问入口
- 已在 `api/select.js` 中增加：
  - `MISSING_TUSHARE_TOKEN` 时降级到数据库最新快照日
  - 历史快照路径的日期构造修复
- 函数级复验结果：
  - `directions = 10`
  - `decisions = 10`
- HTTP 复验结果：
  - `/api/select?limit=5&strategy=seven_factor` 返回 `10` 个方向与 `10` 个决策单
  - `firstDecision` 已包含 `entry_zone`、`stop_loss`、`target_prices`

## 相关文件

- `api/select.js`
- `docs/api-contracts/select.md`
- `docs/acceptance/CODEX_FINAL_E2E_20260327.md`

## 验收证据

- 函数级复验：`node -e` 调用 `buildSelectionPayload(undefined, 'seven_factor', {})`
- HTTP 复验：`curl http://127.0.0.1:3000/api/select?limit=5&strategy=seven_factor`

## 下一步

1. 补正式 E2E 验收报告更新
2. 评估 `selectionDate` + 权重透传路径下的决策引擎日期处理
