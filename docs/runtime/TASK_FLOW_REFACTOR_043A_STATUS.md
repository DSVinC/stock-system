# TASK_FLOW_REFACTOR_043A 状态记录

- 时间：2026-03-29
- 范围：`scripts/optuna_optimizer.py`、`scripts/real_score_cli.mjs`、`api/backtest.js`

## 背景

根据 [2026-03-29-seven-factor-optimization-engineering-plan.md](/Users/vvc/.openclaw/workspace/stock-system/docs/design/2026-03-29-seven-factor-optimization-engineering-plan.md) 的 P0 第一阶段，需要把 `seven_factor` 的筛选层参数真正接入自动迭代链路，不再停留在“页面能填，但 Optuna/评分器没实际使用”。

目标参数：

- `min_score`
- `pe_max`
- `peg_max`
- `max_price`
- `score_stop_loss`
- `stop_loss`
- `take_profit`

## 本轮修复

### 1. Optuna 搜索空间扩展到筛选层

- `scripts/optuna_optimizer.py`
- `seven_factor` 分支新增：
  - `pe_max`
  - `peg_max`
  - `max_price`
- 同时支持从当前研究配置的 `filters.minScore/peMax/pegMax/maxPrice` 读取 seed 参数，首轮 trial 不再丢失页面配置。

### 2. 真实评分 CLI 归一化 seven_factor 参数

- `scripts/real_score_cli.mjs`
- `normalizeStrategyParams()` 现在会把：
  - `filters.minScore -> min_seven_factor_score`
  - `filters.peMax -> pe_max`
  - `filters.pegMax -> peg_max`
  - `filters.maxPrice -> max_price`
- 修复前：筛选层参数即使在页面里存在，也不会稳定传到底层回测引擎。

### 3. 回测引擎实际应用筛选层过滤

- `api/backtest.js`
- `loadHistoricalData()` 追加读取：
  - `pe_ttm`
  - `netprofit_growth`
- `evaluateSevenFactor()` 新增买入过滤：
  - `max_price`
  - `pe_max`
  - `peg_max`
- PEG 按 `PE / 净利润增速` 计算，无法计算或增速非正时视为不通过 PEG 过滤。

## 验证结果

### 语法验证

- `node --check api/backtest.js` ✅
- `node --check scripts/real_score_cli.mjs` ✅
- `python3 -m py_compile scripts/optuna_optimizer.py` ✅

### CLI 评分验证

使用同一股票池与时间区间，仅调整 `PE/PEG/价格上限`：

- 严格筛选：
  - `peMax=60, pegMax=2, maxPrice=150`
  - 结果：`scoreTotal=47`，`tradeCount=8`
- 放宽筛选：
  - `peMax=120, pegMax=4, maxPrice=500`
  - 结果：`scoreTotal=53`，`tradeCount=10`

结论：

- 筛选层参数已真实进入七因子回测逻辑
- 不再是“页面上有，评分器里没用”

### Optuna 小样本验证

- 命令：`python3 scripts/optuna_optimizer.py seven_factor ... --n-trials 5`
- Trial 0 已显示完整七因子参数：
  - `min_score`
  - `pe_max`
  - `peg_max`
  - `max_price`
  - `score_stop_loss`
  - `stop_loss`
  - `take_profit`

结论：

- `seven_factor` 自动迭代已开始搜索筛选层参数
- 当前只是第一阶段，还未进入四维权重/七因子权重搜索

## 当前状态

本轮完成后，`seven_factor` 的自动调优能力从“仅调交易阈值”升级为：

- 筛选层：`min_score / pe_max / peg_max / max_price`
- 交易层：`score_stop_loss / stop_loss / take_profit`

仍未纳入本轮的内容：

- 四维权重自动优化
- 七因子权重自动优化
- 网格参数自动优化
- 样本外验证/WFO

## 下一步

优先继续推进工程方案中的下一步：

1. 四维权重进入受约束搜索空间
2. 版本历史补充“当前任务最佳结果”和“历史最佳结果”的语义区分
3. 最小样本外验证字段进入迭代结果记录
