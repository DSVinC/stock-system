# TASK_FLOW_REFACTOR_044E 状态记录

- 记录时间: 2026-03-29 15:59 (Asia/Shanghai)
- 执行人: Codex
- 目标: 修复持仓估值中“市值为 0”假象，补齐估值数据兜底

## 本轮完成

1. 持仓估值兜底增强
- 文件: `/Users/vvc/.openclaw/workspace/stock-system/api/portfolio.js`
- 变更:
  - 在 `refreshAccountPositionsValuation()` 中保留 `stock_daily` 为主数据源。
  - 当 `stock_daily` 未命中或价格 <= 0 时，新增实时行情兜底（`market-data.getRealtimeQuote`）。
  - 回写 `current_price / market_value / unrealized_pnl` 时使用兜底后的有效价格。

2. 接口验收
- 调用:
  - `GET /api/portfolio/account/1/summary`
- 结果:
  - 当前 `5` 只持仓均返回非零 `market_value`
  - 示例:
    - `300308.SZ market_value=361914`
    - `002920.SZ market_value=160800`
    - `300058.SZ market_value=6960`

## 产出文件

- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_044E_STATUS.md`
