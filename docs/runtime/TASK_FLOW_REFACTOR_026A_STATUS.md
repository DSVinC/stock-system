# TASK_FLOW_REFACTOR_026A 实时状态

**状态**: done  
**开始时间**: 2026-03-28 07:22  
**完成时间**: 2026-03-28 07:30  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent（实现） + Codex（独立验收）

## 任务目标

为 V5_007 提供一个最小可运行的真实打分 CLI，让 Python 优化器不再需要重写回测逻辑。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/scripts/real_score_cli.mjs`
- `/Users/vvc/.openclaw/workspace/stock-system/test/real-score-cli.test.js`

## 已完成

- 新增 `real_score_cli.mjs`
- 复用 `BacktestEngine + quickScore` 实现“真实回测 -> 真实评分 -> JSON 输出”
- 支持 `--strategy-type / --stocks / --start / --end / --params`
- 对 `double_ma` 做 `ma_short/ma_long -> fast_period/slow_period` 兼容映射
- 在回测前显式检查 `stock_daily` 真数据，避免静默回退到 mock 数据
- 用真实数据库样本补了 smoke 测试

## 验收结果

- 通过
- 复验命令：
  - `node --check scripts/real_score_cli.mjs`
  - `node test/real-score-cli.test.js`
- 结果：
  - CLI 返回 `success=true`
  - `scoreTotal` 为数字
  - 无真实数据时会直接失败，不再退回模拟数据

## 边界情况

- 当前 CLI 只覆盖最小真实评分闭环，不做版本保存、任务持久化、优化历史写库
- 当前 smoke 使用真实数据库样本，不代表所有策略类型都已逐一验证

## 下一步建议

1. 让 `scripts/optuna_optimizer.py` 直接调用这个 CLI，替换掉占位分数
2. 如果后续要扩策略类型，再按策略类型逐步补 CLI 参数映射和 smoke 样本
