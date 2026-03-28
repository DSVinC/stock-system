# TASK_FLOW_REFACTOR_025A 实时状态

**状态**: done  
**开始时间**: 2026-03-27 23:00  
**完成时间**: 2026-03-27 23:04  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent（实现） + Codex（独立验收）  

## 任务目标

修复 `TASK_TEST_001` 中由测试 mock / 测试数据口径导致的假失败，减少默认 runner 的旧红灯。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/tests/test-decision-engine.js`

## 已完成

- 修正了 mock `allPromise()` 对 `preloadPrices()` 参数的解参方式，使之与真实 SQL 占位符展开方式一致
- 扩展 mock 价格数据覆盖范围，确保 `generateDecision()` 使用的测试日期不会落在 mock 数据区间外
- 保留产品代码不变，仅收口测试基线

## 验收结果

- 通过
- 复验命令：
  - `node tests/test-decision-engine.js`
- 结果：
  - `TASK_TEST_001` 已从 `5 通过 / 2 失败` 变为 `7 通过 / 0 失败`

## 边界情况

- 这次只修了测试 mock 和测试数据，不代表其它旧红灯已经解决
- 目前还没有重跑整套 `run-all-tests` 去刷新总失败数，后续可以按需再跑

## 下一步建议

1. 继续从旧失败里挑“mock/测试口径问题”优先修，保持低成本减红灯
2. 优先查看 `TASK_TEST_002` 是否也存在类似的 mock/日期/字段语义偏差
