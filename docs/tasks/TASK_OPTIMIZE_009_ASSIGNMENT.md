# 任务分配单：TASK_OPTIMIZE_009

**任务名称**: 因子稳定性指标（IC/衰减/行业偏离）  
**优先级**: P2  
**预计工时**: 3h  
**状态**: completed  

---

## 任务描述

在策略迭代结果中补充因子稳定性指标，覆盖：
- 因子 IC 均值（因子分与次日收益相关性）
- IC 波动（按月 IC 标准差）
- IC 衰减（后段 IC 均值 - 前段 IC 均值）
- 行业偏离（Top 高分样本行业分布偏离）

## 实现内容

1. `scripts/optuna_optimizer.py` 新增：
   - `compute_factor_stability_metrics(...)`
   - `_pearson_corr(...)`、`_mean(...)`、`_std(...)`
2. `optimize_strategy(...)` 输出新增：
   - `factor_stability`
3. `api/iteration-manager.js` 新增透传：
   - `task.factorStability`
   - `resultSummary.factorStability`
4. `iteration-manager.html` 结果摘要展示新增：
   - 因子稳定性状态
   - IC 均值 / 波动 / 衰减
   - 行业偏离（均值/最大）与 Top 行业集中度 HHI
5. 新增测试：
   - `tests/test_optuna_factor_stability.py`

## 验收记录

- `python3 -m py_compile scripts/optuna_optimizer.py` 通过
- `python3 -m unittest tests/test_optuna_regime.py tests/test_optuna_factor_stability.py` 通过（6/6）
- 样例计算（2024 年，3 只股票）返回 `status=ok` 与完整稳定性指标

## 相关文件

- `scripts/optuna_optimizer.py`
- `api/iteration-manager.js`
- `iteration-manager.html`
- `tests/test_optuna_factor_stability.py`
- `docs/runtime/TASK_OPTIMIZE_009_STATUS.md`

---

**创建时间**: 2026-04-01  
**创建者**: Codex
