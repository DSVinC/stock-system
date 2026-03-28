# TASK_FLOW_REFACTOR_002 实时状态

**状态**: done  
**开始时间**: 2026-03-27 10:46  
**完成时间**: 2026-03-27 10:54  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code  
**审查辅助**: Gemini CLI  

## 任务目标

收敛执行流页面文案，让 `select.html` 与 `analysis.html` 明确属于“选股分析 -> 个股分析 -> 监控池 -> 条件单”的执行流程，不再与回测研究流程混线。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/select.html`
- `/Users/vvc/.openclaw/workspace/stock-system/analysis.html`

## 已完成

- `select.html` hero 文案改为执行流第一步表述
- `select.html` 中“导入回测策略”统一改为“从策略库导入参数”
- `select.html` 导入空状态统一改为“暂无可导入的策略库参数”
- `analysis.html` hero 文案改为执行流第二步表述
- 使用 Claude Code 完成定点文案改动
- 使用 Gemini CLI 完成审查与 PR 摘要草稿
- Codex 独立验收完成

## 验收结果

- 通过
- 验收命令：
  - `rg -n "导入回测策略|从策略库导入参数|策略库参数|执行流入口|执行流第二步" select.html analysis.html`
  - `sed -n '748,890p' select.html`
  - `sed -n '188,236p' analysis.html`

## 代理表现记录

### Claude Code
- 优点：在“精确替换”派单下能稳定完成目标文案落盘
- 问题：首次较宽泛提示未正常返回，需要改成更机械的替换式任务

### Gemini CLI
- 优点：降级到 `gemini-2.5-flash` 后能完成审查，并给出最小修正建议与 PR 摘要
- 问题：默认模型 `gemini-3-flash-preview` 本轮连续触发 `429 MODEL_CAPACITY_EXHAUSTED`

## 边界情况

- 当前两个页面是脏文件，本轮只验收目标文案是否命中，不把历史 diff 混入本次结论
- `analysis.html` 中“查看报告”相关内容仍可能带有研究流术语，后续需要单独检查报告模板

## 下一步建议

1. `TASK_FLOW_REFACTOR_003`
   - 收敛研究流页面文案：`backtest.html`、`iteration-manager.html`
2. `TASK_FLOW_REFACTOR_004`
   - 统一“策略库 / 策略参数 / 导入入口”的命名与交互提示
