# TASK_E2E_FIX_006 实时状态

**任务**: backtest.html `seven_factor` 策略配置修复  
**状态**: done  
**开始时间**: 2026-03-27 08:45  
**负责人**: 项目经理（Codex）→ 开发（Claude Code）→ PR（Gemini）→ 验收（Codex）

## 问题描述

E2E 验收显示：
- `backtest.html` 选择 `seven_factor` 策略后，点击“开始回测”
- 页面直接报错：`请选择策略并完成参数配置`
- 实际未发出成功的 `POST /api/backtest/joint/run`

## 已确认根因

- `backtest.html` 的 `getStrategyConfig()` 缺少 `case 'seven_factor'`
- 因此前端始终把 `seven_factor` 视为未配置策略，回测入口被前端拦截
- `api/server.js` 未挂载 `/api/backtest/joint/run` 与 `/api/backtest/joint/config`
- 前端点击“开始回测”后实际命中 404，导致页面报“回测失败”

## 修复结果

- 已在 `backtest.html` 中补齐 `case 'seven_factor'`
- 已在 `api/server.js` 中补挂：
  - `POST /api/backtest/joint/run`
  - `GET /api/backtest/joint/config`
- 浏览器复验显示：
  - 选股 -> 应用到已选股票 -> 开始回测 路径可走通
  - `/api/backtest/joint/run` 返回 `200`
  - 9 个指标卡已不再全是 `--`
  - 页面未再出现“请选择策略并完成参数配置”或 404

## 相关文件

- `backtest.html`
- `docs/api-contracts/backtest-joint.md`
- `docs/acceptance/CODEX_FINAL_E2E_20260327.md`

## 验收证据

- 页面流转脚本：`temp/backtest-e2e-seven-factor-20260327.js`
- 截图：`temp/screenshots/backtest-e2e-seven-factor-20260327.png`

## 下一步

1. 补正式 E2E 验收报告更新
2. 清理 `api/server.js` 中 Gemini 带来的无关改动风险
