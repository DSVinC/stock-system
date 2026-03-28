# TASK_FLOW_REFACTOR_035A 实时状态

**状态**: done  
**开始时间**: 2026-03-28 09:58  
**完成时间**: 2026-03-28 10:04  
**负责人**: Codex（方案/验收）  
**开发执行**: Codex

## 任务目标

为 V5 自迭代结果摘要增加“下一步建议”结构化输出，并在迭代管理页可视化展示，减少任务完成后人工判断下一步动作的沟通成本。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/iteration-manager.js`
- `/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/iteration-manager-result-summary-snapshot.test.js`

## 已完成

- 新增 `deriveNextActionSuggestion(task)` 规则化建议器：
  - `failed` -> `inspect_error_and_retry`
  - `stopped(manual)` -> `resume_iteration`
  - 达标分数 -> `publish_to_strategy_library`
  - 高回撤/低胜率/交易过少等场景 -> 对应风险与参数建议
- `buildTaskResultSummary()` 增加 `nextActionSuggestion` 字段（动作+原因）。
- `iteration-manager.html` 结果摘要新增“下一步建议/建议原因”渲染。
- 快照测试补充 `nextActionSuggestion` 断言，覆盖停止恢复场景。

## 验收结果

- 通过
- 验证方式：
  - `node --check api/iteration-manager.js`
  - `node test/iteration-manager-result-summary-snapshot.test.js`
  - `node test/iteration-manager-recovery.test.js`
  - `node tests/run-all-tests.js`（43/43）

## 边界情况

- 若任务缺失关键指标（如 `winRate/maxDrawdown/tradeCount`），建议器会自动回退到默认动作 `increase_trials`，避免页面空字段或崩溃。
