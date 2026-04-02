# 任务分配单：TASK_OPTIMIZE_001

**任务名称**: 筛选层参数扩展  
**优先级**: P0  
**预计工时**: 2h  
**状态**: completed（代码已落地）  

---

## 任务描述

扩展 `optuna_optimizer.py` 的 `seven_factor` 搜索空间，从当前 4 个参数扩展到 7 个参数，覆盖筛选层核心参数。

## 目标参数

| 参数 | 范围 | 说明 |
|------|------|------|
| `min_score` | 0.65 ~ 0.90 | 七因子最低评分门槛 |
| `pe_max` | 30 ~ 100 | PE 上限 |
| `peg_max` | 1.0 ~ 4.0 | PEG 上限 |
| `max_price` | 80 ~ 800 | 股价上限 |
| `score_stop_loss` | 0.50 ~ 0.80 | 评分止损阈值 |
| `stop_loss` | 0.03 ~ 0.15 | 止损比例 |
| `take_profit` | 0.10 ~ 0.50 | 止盈比例 |

## 实现要求

1. 页面当前传入参数作为 seed
2. Optuna 先试当前参数，再局部扩展搜索
3. 参数语义与 `select.html` 和 `backtest.html` 一致

## 验收标准

- [x] Optuna 搜索空间包含 7 个参数
- [x] Seed 参数优先测试（`enqueue_trial(seed_params)`）
- [x] 回测结果正确记录 7 个参数值（real_score_cli 参数透传）
- [x] 版本历史页面显示新参数（参数摘要可见）

## 相关文件

- `scripts/optuna_optimizer.py` - 搜索空间定义
- `api/iteration-manager.js` - 参数透传
- `iteration-manager.html` - 版本历史展示

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪

---

## 完成说明（2026-04-01 Codex 回填）

- 搜索空间实现位于 `scripts/optuna_optimizer.py`，`seven_factor` 路径已包含：
  - `min_score, pe_max, peg_max, max_price`
  - `score_stop_loss, stop_loss, take_profit`
- `scripts/real_score_cli.mjs` 已将 `min_score -> min_seven_factor_score`，并保留 `pe_max/peg_max/max_price` 映射。
- `api/backtest.js` 的 `evaluateSevenFactor()` 已消费以上筛选/风控参数。
