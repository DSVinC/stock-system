# TASK_FLOW_REFACTOR_043R 状态记录

- 记录时间: 2026-03-29 11:33 (Asia/Shanghai)
- 执行人: Codex
- 目标: 打通 seven_factor 权重调优的真实生效链路（不再“参数可配但结果不变”）

## 本轮完成

1. 七因子权重归一化（factorWeights）
- 修改 `api/select.js`：
  - 新增 `normalizeWeightMap(...)`。
  - 动态七因子评分时对 `factorWeights` 先归一化再计算，避免权重和不为 1 导致评分失真。

2. 行业四维权重真实参与排序（dimensionWeights）
- 修改 `api/select.js`：
  - 原逻辑中 `dimensionWeights` 仅回显，不参与行业排序。
  - 现新增 `weightedDimensionScore` 与 `rankScore`：
    - `weightedDimensionScore = social/policy/public/business` 按归一化权重加权
    - 当传入 `dimensionWeights` 时：`rankScore = 0.5 * avgScore + 0.5 * weightedDimensionScore`
  - 行业排序改用 `rankScore`，方向输出 `score` 也改为 `rankScore`。
  - `metrics` 新增 `rankScore/weightedDimensionScore`，便于前端与迭代器观察权重作用。

3. 阈值口径收口
- `s.score >= 0.75` 固定门槛改为：
  - `s.score >= (filters.minSevenFactorScore || 0.75)`
- 避免前端传了 `minScore` 但底层仍按固定 0.75 裁剪。

## 验收证据

1. 语法检查
- `node --check api/select.js` 通过

2. 权重生效对比（同日期 `20260324`）
- 基线请求：
  - `/api/select?date=20260324&strategy=seven_factor&limit=5`
  - Top1 行业：`电信运营`，`score=778`
- 调整维度权重：
  - `dimensionWeights={"social":0.7,"policy":0.1,"public":0.1,"business":0.1}`
  - Top1 行业变为：`半导体`，`score=530`
  - 原 Top1 `电信运营` 下沉到第 3，说明权重已真实影响排序结果。

## 产出文件

- `api/select.js`
- `docs/runtime/TASK_FLOW_REFACTOR_043R_STATUS.md`
