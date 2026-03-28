# TASK_FLOW_REFACTOR_004 实时状态

**状态**: done  
**开始时间**: 2026-03-27 11:40  
**完成时间**: 2026-03-27 12:24  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code（A/B 三模型）  
**主模型结论**: `glm-5` 与 `MiniMax-M2.5` 同分；主项目采用 `glm-5` 冠军方案回灌  

## 任务目标

修复 `select.html` 从策略库导入参数后的身份同步问题，让执行流程消费策略库时，不仅应用参数，还能把复制后的策略副本身份写入当前配置，强化“策略库是唯一中枢”。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/select.html`
- `/Users/vvc/.openclaw/workspace/stock-system/test/select-strategy-import.test.js`

## 已完成

- 新增最小复现测试 `test/select-strategy-import.test.js`
- 先确认当前主项目失败：导入后 `templateId/templateName` 仍为空
- 对 `glm-5` / `qwen3-coder-plus` / `MiniMax-M2.5` 三模型派发同题修复
- 由我独立跑三份候选测试并比较 diff
- 将胜出的 `glm-5` 方案回灌主项目
- 主项目复验通过：导入后会把复制后的策略副本 `id/name` 持久化到 `stockSelectConfig`

## A/B 评分结果

| 模型 | 命中项 | 结果 | 结论 |
|------|--------|------|------|
| `glm-5` | 5/5 | 一轮命中、改动最收敛 | 当前最适合小范围逻辑修复 |
| `qwen3-coder-plus` | 4/5 | 通过主断言，但实现更绕 | 可用，但不如 `glm-5` 简洁 |
| `MiniMax-M2.5` | 5/5 | 与 `glm-5` 同级通过 | 逻辑修复场景表现已追平 `glm-5` |

## 验收结果

- 通过
- 复现命令：
  - `node test/select-strategy-import.test.js`（修复前失败）
- 复验命令：
  - `node test/select-strategy-import.test.js`
  - `sed -n '1635,1700p' select.html`

## 边界情况

- 本轮只修复“导入后身份同步”问题，没有改策略库发布、策略回流或执行反馈结构
- `templateId/templateName` 仍沿用现有命名；如果后续要把“模板”与“策略库副本”彻底解耦，需要单独任务统一字段语义
- 候选测试使用 HTML 片段 + stub DOM/localStorage 跑导入流程，适合函数级复现，不替代浏览器级冒烟

## 下一步建议

1. `TASK_FLOW_REFACTOR_005`
   - 统一“模板 / 策略库副本 / 执行配置”字段命名
2. `TASK_FLOW_REFACTOR_006`
   - 设计条件单/监控结果如何回流策略管理
3. `A/B/C 模型评测`
   - 继续补 C 类中等复杂度实现任务样本
