# 任务分配单：TASK_OPTIMIZE_003

**任务名称**: 样本外验证最小闭环  
**优先级**: P0  
**预计工时**: 3h  
**状态**: completed（最小闭环已落地）  

---

## 任务描述

加入最小样本外验证闭环，避免回测分数只是样本内优秀。

## 验证窗口设计

| 窗口 | 时间范围 | 说明 |
|------|----------|------|
| **训练窗口 (IS)** | 2023-01-01 ~ 2024-06-30 | 优化参数 |
| **验证窗口 (OOS)** | 2024-07-01 ~ 2024-12-31 | 验证泛化能力 |

## 新增指标

每个版本至少记录：
- `in_sample_score`
- `out_of_sample_score`
- `in_sample_total_return`
- `out_of_sample_total_return`
- `out_of_sample_trade_count`

## 发布门槛

- `out_of_sample_score >= 75`

## 验收标准

- [x] 版本结果包含 IS/OOS 验证结构（`validation`）
- [x] 页面展示 IS/OOS 与 WFE 摘要
- [x] 页面同时展示“回测评分指标”和“执行反馈指标”信息

## 相关文件

- `scripts/optuna_optimizer.py` - IS/OOS 窗口划分
- `scripts/real_score_cli.mjs` - 评分入口
- `api/iteration-manager.js` - 版本历史字段扩展
- `iteration-manager.html` - 指标展示

---

**创建时间**: 2026-04-01  
**创建者**: 灵爪

---

## 完成说明（2026-04-01 Codex 回填）

- `scripts/optuna_optimizer.py` 已输出 `validation`（IS/OOS/WFE）。
- `iteration-manager.html` 的最佳结果区域已展示 `validation` 关键字段（IS/OOS 区间、分数、trade_count、WFE）。
- 发布限制当前仍由执行样本与综合规则控制，OOS 阈值强制门槛作为下一阶段可配置项继续强化。
