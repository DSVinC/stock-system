# TASK_FLOW_REFACTOR_025B 实时状态

**状态**: done  
**开始时间**: 2026-03-28 00:05  
**完成时间**: 2026-03-28 00:09  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent（实现） + Codex（独立验收）  

## 任务目标

修复 `TASK_TEST_002` 中由测试 mock / 字段语义 / 测试写法导致的旧红灯，不改产品代码。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/tests/test-backtest-integration.js`

## 已完成

- 补齐了 `stock_factor_snapshot` 单条查询的 mock，避免 `getSnapshot()` 回退到低分兜底
- 给 mock `decisionEngine` 补了 `config.strategyType`
- 统一测试内股票代码 lookup 语义，兼容 `sz.000001` / `000001.sz`
- 调整仓位测试写法，改为断言真实分段逻辑

## 验收结果

- 通过
- 复验命令：
  - `node tests/test-backtest-integration.js`
- 结果：
  - `TASK_TEST_002` 已从 `4 通过 / 4 失败` 变为 `8 通过 / 0 失败`
  - 重新跑 `node tests/run-all-tests.js` 后，总体从 `33/42` 提升到 `39/42`

## 边界情况

- 这次只收口了测试基线，没有修改产品代码
- 默认 runner 仍剩 3 个失败，集中在 `TASK_TEST_003` 和 `TASK_TEST_004`

## 下一步建议

1. 继续从 `TASK_TEST_003` 里挑最小 mock/测试口径问题往下收
2. `TASK_TEST_004` 涉及性能基线，优先级可放在 `TASK_TEST_003` 之后
