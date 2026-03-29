# TASK_FLOW_REFACTOR_043O 状态记录

- 记录时间: 2026-03-29 11:14 (Asia/Shanghai)
- 执行人: Codex
- 目标: 修复“股票搜索总是未找到匹配股票”的稳定性问题（本地库优先，不依赖外网）

## 本轮完成

1. 股票搜索改为本地库优先
- 修改 `api/market-data.js`：
  - 新增 `searchStocksFromLocalDb(query, limit)`：
    - 优先查询 `stocks`（`list_status='L'`）
    - 不足时补查 `stock_list`（`status='L'`）
  - 新增 `dedupeStockRows` 与 `toSymbol`，统一输出 `ts_code/symbol/name/industry`。
  - `searchStock` 改为先走本地库，再走 Tushare 兜底。
  - `searchStocks` 改为先走本地库，再走 Tushare 兜底。

2. 修复历史隐患
- 旧逻辑中 `searchStocks` 先调用已下线路径（`runSinaScript`）再依赖 Tushare，离线或 token 异常时容易直接返回空。
- 新逻辑去除了该依赖链路作为主路径，确保本地数据可用时搜索可用。

3. SQL 逻辑修正
- 修复 `stock_list` 查询条件优先级：
  - `WHERE (status IS NULL OR status='L') AND (...)`
- 避免 `OR/AND` 优先级导致筛选范围异常。

## 验收证据

1. 语法检查
- `node --check api/market-data.js` 通过

2. 直接函数实测
- `searchStocks('中国电信', 5)` 返回 1 条，首条：
  - `601728.SH / 中国电信`
- `searchStocks('600050', 5)` 返回 1 条，首条：
  - `600050.SH / 中国联通`
- `searchStock('600050')` 精确返回：
  - `600050.SH / 中国联通`

3. HTTP 接口实测
- `GET /api/stock/search/fuzzy?q=中国电信&limit=5` 返回：
  - `success=true`
  - `data[0]=601728.SH / 中国电信`

## 产出文件

- `api/market-data.js`
- `docs/runtime/TASK_FLOW_REFACTOR_043O_STATUS.md`
