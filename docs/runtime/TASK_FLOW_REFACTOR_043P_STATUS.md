# TASK_FLOW_REFACTOR_043P 状态记录

- 记录时间: 2026-03-29 11:20 (Asia/Shanghai)
- 执行人: Codex
- 目标: 修复模拟账户持仓“市值为 0”异常，确保估值按最新收盘价稳定刷新

## 本轮完成

1. 持仓估值代码匹配增强
- 修改 `api/portfolio.js`：
  - `getLatestCloseByTsCode` 从“单一 `ts_code = ?` 精确匹配”改为“多格式候选匹配”：
    - 原始值
    - 大小写变体
    - `normalizeToApi`
    - `normalizeToDb`
  - 查询改为 `IN (...)` 后按 `trade_date DESC` 取最新一条。

2. 根因修正
- 历史数据存在 API/DB 两种代码格式并存时，旧逻辑会查不到价格，导致 `market_value=0`。
- 新逻辑可在格式不一致时自动命中最新日线收盘价，避免“有持仓但市值为 0”的假现象。

## 验收证据

1. 语法检查
- `node --check api/portfolio.js` 通过

2. API 实测（账户 1）
- `GET /api/portfolio/account/1/summary` 返回持仓估值均为非零，且附带最新交易日：
  - `300308.SZ` 市值 `361914`（trade_date `20260324`）
  - `002920.SZ` 市值 `160800`（trade_date `20260324`）
  - `300058.SZ` 市值 `6960`（trade_date `20260324`）
  - `600050.SH` 市值 `908`（trade_date `20260324`）
  - `601728.SH` 市值 `585`（trade_date `20260324`）

## 产出文件

- `api/portfolio.js`
- `docs/runtime/TASK_FLOW_REFACTOR_043P_STATUS.md`
