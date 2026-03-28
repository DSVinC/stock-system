# TASK_FLOW_REFACTOR_025C 实时状态

**状态**: done  
**开始时间**: 2026-03-28 00:12  
**完成时间**: 2026-03-28 00:16  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent（实现） + Codex（独立验收）  

## 任务目标

收口 `TASK_TEST_003` 的唯一旧红灯，不改产品代码。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/tests/test-full-flow.js`

## 已完成

- 补齐测试 mock 对 `getNextTradingDate()` 的 `getPromise()` 返回
- 让 `TEST_003_04` 按 mock 交易日口径正确验证“选股时点之后的回测开始日期”
- 保持其余 5 项测试继续通过

## 验收结果

- 通过
- 复验命令：
  - `node tests/test-full-flow.js`
  - `node tests/run-all-tests.js`
- 结果：
  - `TASK_TEST_003` 已从 `5 通过 / 1 失败` 变为 `6 通过 / 0 失败`
  - 默认 runner 总体提升到 `40 通过 / 2 失败`

## 边界情况

- 这次仍然只收口测试基线，没有修改产品代码
- 当前默认 runner 只剩 `TASK_TEST_004` 性能测试中的 2 条失败

## 下一步建议

1. 继续查看 `TASK_TEST_004` 的失败是否属于性能阈值/统计口径过严
2. 如果只是旧性能基线失真，优先收口测试，而不是急着改引擎实现
