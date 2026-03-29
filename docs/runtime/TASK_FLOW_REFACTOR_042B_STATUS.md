# TASK_FLOW_REFACTOR_042B 实时状态

**状态**: done  
**开始时间**: 2026-03-28 15:12  
**完成时间**: 2026-03-28 15:24  
**负责人**: Codex  
**开发执行**: Codex / subagent

## 任务目标

修复 `select.html` 行业卡片四维评分全部显示 `3.0` 的问题，区分“服务未注入 TUSHARE_TOKEN 命中降级路径”和“历史快照路径固定 3 分占位”两类原因，并完成兜底修复。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/select.js`
- `/Users/vvc/.openclaw/workspace/stock-system/scripts/load-secrets.sh`
- `/Users/vvc/.openclaw/workspace/stock-system/temp/select-dimension-fix.json`
- `/Users/vvc/.openclaw/workspace/stock-system/temp/screenshots/select-dimension-fix/select-dimension-fix.png`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_042B_STATUS.md`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/PROJECT_PROGRESS.md`

## 已完成

- 确认 3000 端口旧服务未带 `TUSHARE_TOKEN` 启动，因此 `/api/select` 命中了历史快照降级路径。
- 使用 [scripts/load-secrets.sh](/Users/vvc/.openclaw/workspace/stock-system/scripts/load-secrets.sh) 从 Keychain 注入 `skills/tushare/token`，重新启动本地服务。
- 修复 `api/select.js` 的历史快照路径，不再返回固定 `dimensions: {3,3,3,3}`，而是基于 `stock_factor_snapshot` 中的四维列做行业聚合。
- 为快照路径补回 `methodology` 元数据，便于前后端识别当前走的是实时路径还是历史聚合路径。

## 验收结果

- 通过（接口 + 浏览器验收）
- 当前 `/api/select` 返回：
  - `methodology.framework = 自上而下行业筛选`
  - 首个方向四维 = `social 5 / policy 3 / public 5 / business 5`
- 页面验收截图与结果：
  - `/Users/vvc/.openclaw/workspace/stock-system/temp/select-dimension-fix.json`
  - `/Users/vvc/.openclaw/workspace/stock-system/temp/screenshots/select-dimension-fix/select-dimension-fix.png`

## 边界情况

- 即使未来本地服务再次缺少 `TUSHARE_TOKEN`，历史快照路径也不会再统一返回四个 `3.0`。
- 当前实时路径仍依赖 Tushare 可用性；若外部接口异常，系统会继续回退到快照聚合结果。
