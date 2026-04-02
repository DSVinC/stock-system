# 任务分配单：TASK_OPTIMIZE_002

**任务名称**: 四维度权重搜索接入  
**优先级**: P0  
**预计工时**: 3h  
**状态**: completed（代码已落地）  

---

## 任务描述

在 Optuna 优化器中接入四维度权重搜索，作为权重层优化的第一步。

## 目标参数

| 参数 | 范围 | 说明 |
|------|------|------|
| `dimensionWeights.social` | 归一化 | 社会经济趋势权重 |
| `dimensionWeights.policy` | 归一化 | 政策方向权重 |
| `dimensionWeights.public` | 归一化 | 舆论热度权重 |
| `dimensionWeights.business` | 归一化 | 商业变现权重 |

**约束**: sum = 1.0

## 实现方案

**推荐**：归一化系数法
1. 采样 4 个非负系数 a, b, c, d
2. 归一化：w_i = a_i / sum(a)
3. 写回 dimensionWeights 对象

**不推荐**：Dirichlet 采样（第一阶段太复杂）

## 验收标准

- [x] Optuna 搜索空间包含 4 维权重
- [x] 权重归一化 sum=1.0（normalize_group）
- [x] 回测结果正确记录权重值（参数透传）
- [x] 版本历史页面显示权重摘要（参数摘要）

## 相关文件

- `scripts/optuna_optimizer.py` - 权重采样逻辑
- `api/select.js` - 权重参数使用
- `api/iteration-manager.js` - 权重透传

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪

---

## 完成说明（2026-04-01 Codex 回填）

- `scripts/optuna_optimizer.py` 已实现 `dimension_social/policy/public/business` 的采样和归一化。
- `api/backtest.js` 已在 `getSevenFactorDecisionScore()` 中消费 `dimensionWeights` 并参与 `decisionScore` 计算。
