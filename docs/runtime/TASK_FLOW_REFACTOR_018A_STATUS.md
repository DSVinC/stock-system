# TASK_FLOW_REFACTOR_018A 实时状态

**状态**: done  
**开始时间**: 2026-03-27 20:24  
**完成时间**: 2026-03-27 20:31  
**负责人**: Codex（方案/验收）  
**开发执行**: subagent（实现） + Codex（独立验收）  

## 任务目标

修复“发布到策略库成功但未必进入公开口径”的断点，确保研究版本一旦发布，执行流入口就能真正看到它。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/api/strategy-config.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/strategy-config-publish-version.test.js`

## 已完成

- `publishVersionToStrategyLibrary()` 插入 `strategy_configs` 时已显式写入 `is_public = 1`
- 复现测试已补齐并通过，明确约束：
  - 发布出的策略配置 `is_public === 1`
  - `public list` 查询能查到该策略
- 保留了既有边界处理：
  - 缺少 `version_id` 返回 `400`
  - 版本不存在返回 `404`
  - 无执行反馈时仍按 `no_data / none / 0` 聚合

## 验收结果

- 通过
- 复验命令：
  - `node --check api/strategy-config.js`
  - `node test/strategy-config-publish-version.test.js`

## 边界情况

- 这一步只保证“发布即公开可见”，没有处理策略库页如何展示反馈。
- 真实数据库 smoke 没有直接复刻 `strategy_versions` 结构，因为 live schema 与测试 stub 不同；当前以模块级复现测试为准。

## 下一步建议

1. 继续补齐策略库页面对公开策略反馈的真实展示
2. 后续补一条浏览器级回归：从迭代管理页发布后，在执行流或策略库页中确认新策略可见
