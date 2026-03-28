# TASK_FLOW_REFACTOR_040A 实时状态

**状态**: done  
**开始时间**: 2026-03-28 11:47  
**完成时间**: 2026-03-28 12:03  
**负责人**: Codex  
**开发执行**: Codex

## 任务目标

增强 V5_008 二次迭代决策逻辑：在现有“回撤/胜率/样本量”基础上补齐“模拟偏差/夏普/收益结构/未达阈值完成态”规则，并以可回归测试固化。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/iteration-manager.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/iteration-manager-next-action-rules.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/tests/run-all-tests.js`
- `/Users/vvc/.openclaw/workspace/stock-system/README.md`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/runtime/TASK_FLOW_REFACTOR_040A_STATUS.md`
- `/Users/vvc/.openclaw/workspace/stock-system/docs/PROJECT_PROGRESS.md`

## 方案输入（不确定点先讨论）

- 已使用 `gemini -p` 进行规则建议讨论，产出 IF-THEN 规则候选。
- 最终落地时以项目现有字段可用性为约束，只实现当前 `iteration-manager` 能稳定获得并可测试覆盖的规则。

## 已完成

- 在 `deriveNextActionSuggestion()` 中新增规则：
  - `completed` 但未达阈值 => `increase_trials`
  - 模拟偏差绝对值 >= 20% => `recalibrate_slippage_model`
  - 夏普比率 < 1 => `optimize_exit_ratio`
  - 胜率 >= 55% 但收益率 < 10% => `increase_holding_period`
- 新增 `getLatestMetricsFromHistory()`，统一读取最近一轮指标，避免误取旧轮次。
- 新增回归脚本 `iteration-manager-next-action-rules.test.js` 并接入默认总测。
- 默认总测由 `49/49` 升级到 `50/50`。

## 验收结果

- 通过
- 验证方式：
  - `node test/iteration-manager-next-action-rules.test.js` ✅
  - `node test/iteration-manager-next-action-readiness.test.js` ✅
  - `node tests/run-all-tests.js` ✅（`50/50`）

## 边界情况

- 规则优先级保持“实盘门禁 > 风险 > 交易质量 > 默认扩迭代”，避免多规则冲突时给出互相矛盾建议。
