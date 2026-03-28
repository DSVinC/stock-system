# TASK_FLOW_REFACTOR_005 实时状态

**状态**: done  
**开始时间**: 2026-03-27 12:30  
**完成时间**: 2026-03-27 12:42  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code（A/B 三模型）  
**主模型结论**: `glm-5` 在 C 类中等复杂度实现任务中明显领先  

## 任务目标

统一执行流程中的策略身份字段语义，明确区分：

- 模板导入：`strategySource = template`
- 策略库副本导入：`strategySource = strategy_config`

同时保留 `templateId/templateName` 兼容字段，并新增 `strategyConfigId/strategyConfigName`。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/select.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/select-strategy-reference.test.js`
- `/Users/vvc/.openclaw/workspace/stock-system/test/select-strategy-import.test.js`

## 已完成

- 新增 `test/select-strategy-reference.test.js`
- 先确认主项目失败：模板导入后没有 `strategySource = template`
- 三模型同题实现 C 类任务
- 主项目最终双测通过：
  - `node test/select-strategy-import.test.js`
  - `node test/select-strategy-reference.test.js`
- 执行流程现在会统一写入：
  - `strategySource`
  - `strategyConfigId`
  - `strategyConfigName`
  - 并保留 `templateId/templateName` 兼容

## A/B 评分结果

| 模型 | 命中项 | 结果 | 结论 |
|------|--------|------|------|
| `glm-5` | 5/5 | 双测通过、实现最完整 | 当前最适合 C 类中等复杂度实现 |
| `qwen3-coder-plus` | 1/5 | 引入重复残片，破坏函数结构 | 当前不适合直接承担 C 类主开发 |
| `MiniMax-M2.5` | 2/5 | 保持文件稳定，但未补齐模板来源字段 | 可做次选，不适合作为 C 类第一候选 |

## 验收结果

- 通过
- 复现命令：
  - `node test/select-strategy-reference.test.js`（修复前失败）
- 复验命令：
  - `node test/select-strategy-import.test.js`
  - `node test/select-strategy-reference.test.js`
  - `sed -n '995,1015p' select.html`
  - `sed -n '1685,1705p' select.html`

## 边界情况

- 本轮统一的是执行流程入口的字段语义，还没有把这些字段继续传到 `analysis.html`、监控池、条件单
- 兼容期内，`templateId/templateName` 会继续回填策略库副本身份，避免旧逻辑断裂
- 如果后续页面开始直接消费 `strategyConfigId/strategyConfigName`，需要单独做一次跨页面兼容检查

## 下一步建议

1. `TASK_FLOW_REFACTOR_006`
   - 把统一后的策略身份字段传递到分析页与后续执行链路
2. `TASK_FLOW_REFACTOR_007`
   - 设计执行反馈如何回流到策略管理
3. 三模型总结
   - 当前项目的 A/B/C 评测已完整，可形成默认模型策略
