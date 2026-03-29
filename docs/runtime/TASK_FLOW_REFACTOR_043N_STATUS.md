# TASK_FLOW_REFACTOR_043N 状态记录

- 记录时间: 2026-03-29 11:06 (Asia/Shanghai)
- 执行人: Codex
- 目标: 修复 `real_score_cli` 对股票代码格式（`600519.SH` / `sh.600519`）的单格式依赖，避免误报“缺少真实数据”

## 本轮完成

1. 真实评分 CLI 代码格式兼容修复
- 修改 `scripts/real_score_cli.mjs`：
  - `parseStocks` 不再强制把输入全部转为 DB 格式。
  - 新增 `buildCodeCandidates(stockCode)`，为每只股票生成多格式候选：
    - 原始值
    - 大小写变体
    - `normalizeToDb`
    - `normalizeToApi`
    - 市场前缀补全兼容（`SH.600519` / `sh.600519` / `600519.SH`）
  - `ensureRealData` 改为逐候选探测真实数据，并返回 `resolvedStocks`。
  - 回测引擎改用 `resolvedStocks` 执行，确保实际交易阶段使用可命中的 `ts_code`。

2. 错误语义保持严格
- 若所有候选代码都没有覆盖到区间行情，仍会抛出硬错误：
  - `指定区间内缺少真实数据: ...`
- 不做降级和伪装成功，继续遵循“有问题就报错”的口径。

## 验收证据

1. 语法检查
- `node --check scripts/real_score_cli.mjs` 通过

2. 实测（输入 DB 格式，数据表实际为 API 格式）
- 命令：
  - `node scripts/real_score_cli.mjs --strategy-type double_ma --stocks sh.600519 --start 2020-01-01 --end 2020-12-31 --params '{"fast_period":5,"slow_period":20}'`
- 结果：
  - `success=true`
  - `scoreTotal=73`
  - `tradeCount=6`
- 说明：
  - 证明 `sh.600519` 已可自动解析并命中真实数据，不再被误判为“缺少真实数据”。

3. 回归检查
- `node temp/e2e-runner.js > temp/e2e_latest.json` 已执行
- 汇总结果：
  - `select=true`
  - `backtest=true`
  - `iteration=true`

## 产出文件

- `scripts/real_score_cli.mjs`
- `docs/runtime/TASK_FLOW_REFACTOR_043N_STATUS.md`
