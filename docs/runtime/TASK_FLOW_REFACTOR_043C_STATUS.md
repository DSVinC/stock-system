# TASK_FLOW_REFACTOR_043C 状态记录

- 时间：2026-03-29
- 范围：`scripts/optuna_optimizer.py`

## 背景

在 `TASK_FLOW_REFACTOR_043B` 中，四维权重已经进入自动搜索，但七因子权重仍然只能手动传入。这会导致：

- 自动迭代的“最佳参数”仍然不完整
- 页面和版本历史无法展示完整的七因子策略权重配置
- 七因子策略依然停留在“部分分层优化”

## 本轮修复

### 1. 七因子权重进入 Optuna 搜索空间

- `scripts/optuna_optimizer.py`
- 新增：
  - `factor_trend`
  - `factor_momentum`
  - `factor_valuation`
  - `factor_earnings`
  - `factor_capital`
  - `factor_volatility`
  - `factor_sentiment`

### 2. 返回结果自动归一化为 `factorWeights`

- Optuna 内部搜索原始正系数
- 输出时自动归一化为：
  - `factorWeights.trend`
  - `factorWeights.momentum`
  - `factorWeights.valuation`
  - `factorWeights.earnings`
  - `factorWeights.capital`
  - `factorWeights.volatility`
  - `factorWeights.sentiment`

### 3. Seed 参数兼容已有页面结构

- 现在支持从现有研究配置 `factorWeights` 中读取种子参数
- 这样自动迭代会围绕当前页面/策略库权重做局部搜索，而不是完全脱离已有配置

## 验证结果

执行：

- `python3 scripts/optuna_optimizer.py seven_factor ... --n-trials 1`

返回的 `best_params` 已包含：

- `dimensionWeights`
- `factorWeights`
- `pe_max / peg_max / max_price`
- `min_seven_factor_score`
- `score_stop_loss / stop_loss / take_profit`

说明：

- `seven_factor` 的“完整研究配置结构”现在已能由自动迭代直接产出
- 后续前端只需要消费该结构并展示即可

## 当前状态

截至本轮，`seven_factor` 自动调优第一版已覆盖：

- 筛选层
- 四维权重层
- 七因子权重层
- 交易层

剩余主要缺口：

1. 页面把 `dimensionWeights / factorWeights` 最佳结果展示清楚
2. 版本历史对完整权重配置做摘要展示
3. 样本外验证/WFO
4. 网格参数自动优化
