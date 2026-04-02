# 任务分配单：TASK_OPTIMIZE_005

**任务名称**: 多目标评分函数（惩罚项）  
**优先级**: P1  
**预计工时**: 2h  
**状态**: completed  

---

## 任务描述

将 Optuna 目标从“仅优化 scoreTotal”升级为“综合目标”，对低交易样本、高回撤、负年化收益加入惩罚项，降低伪优解概率。

## 实现内容

1. 在 `scripts/optuna_optimizer.py` 新增 `compute_adjusted_objective(...)`。
2. Objective 改为返回 `adjusted_score`，并把惩罚项写入 `trial.user_attrs`。
3. 惩罚项当前包含：
   - `trade_penalty`（交易数 < 30）
   - `drawdown_penalty`（maxDrawdown > 20%）
   - `return_penalty`（annualizedReturn < 0）

## 验收标准

- [x] Objective 不再只用 `scoreTotal`
- [x] 惩罚项明细可追踪（user_attrs）
- [x] 语法检查通过
- [x] 惩罚函数样例验证通过

## 相关文件

- `scripts/optuna_optimizer.py`
- `docs/runtime/TASK_OPTIMIZE_005_STATUS.md`

---

**创建时间**: 2026-04-01  
**创建者**: Codex
