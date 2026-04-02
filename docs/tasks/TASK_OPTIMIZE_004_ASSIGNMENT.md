# 任务分配单：TASK_OPTIMIZE_004

**任务名称**: 七因子权重搜索接入（防极端约束）  
**优先级**: P1  
**预计工时**: 2h  
**状态**: completed  

---

## 任务描述

对 `seven_factor` 的因子权重搜索增加工程约束，避免单因子权重过高导致策略可解释性和泛化能力下降。

## 实现内容

1. 在 `scripts/optuna_optimizer.py` 增加通用有界归一化函数 `normalize_group_with_bounds(...)`。
2. `seven_factor` 搜索路径中，`factorWeights` 强制满足：
   - 每个因子权重 `>= 0.03`
   - 每个因子权重 `<= 0.40`
   - 权重和 `sum = 1.0`
3. `build_cli_params(...)` 阶段同步做一次有界归一化，防止透传阶段引入越界权重。

## 验收标准

- [x] 七因子权重搜索空间带边界约束（0.03~0.40）
- [x] 输出参数满足 sum=1.0
- [x] CLI 透传链路保留边界约束
- [x] 语法检查通过

## 相关文件

- `scripts/optuna_optimizer.py`
- `docs/runtime/TASK_OPTIMIZE_004_STATUS.md`

---

**创建时间**: 2026-04-01  
**创建者**: Codex
