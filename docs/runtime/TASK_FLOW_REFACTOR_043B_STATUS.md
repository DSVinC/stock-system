# TASK_FLOW_REFACTOR_043B 状态记录

- 时间：2026-03-29
- 范围：`api/backtest.js`、`scripts/optuna_optimizer.py`

## 背景

在 `TASK_FLOW_REFACTOR_043A` 完成后，`seven_factor` 已能自动搜索筛选层和交易层参数，但 `dimensionWeights` 仍只停留在页面配置，不会真实影响回测结果。与此同时，历史实现还存在一个隐性口径问题：

- 快照库 `seven_factor_score / industry_total_score` 是 `0~10` 左右
- 七因子阈值 `min_score / score_stop_loss` 却按 `0~1` 语义使用

这会导致：

- 阈值名义生效，但实际几乎总是满足
- 四维权重即使传入，也对七因子回测结果影响很弱

## 本轮修复

### 1. 回测引擎统一七因子决策分口径

- `api/backtest.js`
- 新增分值归一化：
  - `0~10 -> 0~1`
  - `0~100 -> 0~1`
- `evaluateSevenFactor()` 不再直接用原始 `stock.seven_factor_score`
- 改为计算：
  - `factorScore`：按 `factorWeights` 动态重算七因子分
  - `dimensionScore`：按 `dimensionWeights` 动态重算四维度分
  - `decisionScore = factorScore * 0.7 + dimensionScore * 0.3`

### 2. 回测历史数据补足原始维度/因子字段

- `api/backtest.js`
- `loadHistoricalData()` 追加读取：
  - 四维：`social_score / policy_score_raw / public_score / business_score`
  - 七因子：`trend_score / momentum_score / valuation_score / earnings_score / capital_score_raw / volatility_score / sentiment_score_raw`

### 3. Optuna 接入四维权重搜索

- `scripts/optuna_optimizer.py`
- `seven_factor` 新增搜索参数：
  - `dimension_social`
  - `dimension_policy`
  - `dimension_public`
  - `dimension_business`
- 搜索时先搜正系数，再自动归一化为 `dimensionWeights`
- 返回给上层的 `best_params` 已是可直接消费的结构：
  - `dimensionWeights`
  - `min_seven_factor_score`
  - `pe_max / peg_max / max_price`
  - `score_stop_loss / stop_loss / take_profit`

### 4. 修正七因子搜索边界

- `scripts/optuna_optimizer.py`
- 因为阈值口径已经收正，旧边界 `min_score >= 0.70` 明显过高
- 新边界调整为：
  - `min_score: 0.45 ~ 0.80`
  - `score_stop_loss: 0.35 ~ 0.70`

## 验证结果

### 权重影响验证

同一股票池、同一时间区间、同一筛选条件，仅改变权重：

#### 配置 A（默认权重）

- `minScore=0.55`
- `peMax=120`
- `pegMax=4`
- `maxPrice=500`
- 默认四维/七因子权重

结果：

- `scoreTotal=40`
- `tradeCount=171`
- `totalReturn=-177145`

#### 配置 B（偏政策/低波动权重）

- 同样筛选条件
- 四维权重改为：
  - `social=0.05`
  - `policy=0.65`
  - `public=0.05`
  - `business=0.25`
- 七因子权重改为更偏动量/波动

结果：

- `scoreTotal=60`
- `tradeCount=195`
- `totalReturn=36462`

结论：

- 四维权重与因子权重已真实进入回测结果
- 不再只是页面展示项

### Optuna 搜索验证

执行：

- `python3 scripts/optuna_optimizer.py seven_factor ... --n-trials 2`

返回：

- `best_score = 60.0`
- `trade_count = 190`
- `totalReturn = 15943`
- `best_params.dimensionWeights` 为自动搜索生成的新权重：
  - `social: 0.2309`
  - `policy: 0.2033`
  - `public: 0.2197`
  - `business: 0.3462`

说明：

- 四维权重自动调优已具备最小可运行能力

## 当前状态

`seven_factor` 现已进入“分层优化第一版”：

- 筛选层：已接入
- 四维权重层：已接入
- 交易层：已接入

尚未完成：

- 七因子权重自动搜索
- 样本外验证/WFO
- 网格参数自动优化

## 下一步

继续推进：

1. 七因子权重进入受约束搜索
2. `iteration-manager` 页面显示新的 `dimensionWeights` 最佳参数摘要
3. 版本历史补充样本内/样本外验证字段
