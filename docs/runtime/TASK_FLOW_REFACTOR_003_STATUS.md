# TASK_FLOW_REFACTOR_003 实时状态

**状态**: done  
**开始时间**: 2026-03-27 10:58  
**完成时间**: 2026-03-27 11:07  
**负责人**: Codex（派单/验收）  
**开发执行**: Claude Code（A/B 三模型）  
**主模型结论**: `glm-5` 胜出并落盘主项目  

## 任务目标

收敛研究流页面文案，让 `backtest.html` 与 `iteration-manager.html` 明确属于“回测 -> 策略管理/迭代 -> 策略库”的研究流程，不再与执行流程混线。

## 本轮范围

- `/Users/vvc/.openclaw/workspace/stock-system/backtest.html`
- `/Users/vvc/.openclaw/workspace/stock-system/iteration-manager.html`

## 已完成

- `backtest.html` hero 副标题改为研究流入口表述
- `backtest.html` “回测配置”说明改为研究流语义
- `backtest.html` “选股说明”改为历史样本构建语义
- `iteration-manager.html` hero 副标题改为研究流第二步表述
- `iteration-manager.html` 返回按钮改为“← 返回回测研究”
- 完成 `glm-5` / `qwen3-coder-plus` / `MiniMax-M2.5` 三模型 A/B
- 由 `glm-5` 冠军方案落盘主项目

## A/B 评分结果

| 模型 | 命中项 | 结果 | 结论 |
|------|--------|------|------|
| `glm-5` | 5/5 | 一轮全命中 | 当前最适合 Claude Code 主开发 |
| `qwen3-coder-plus` | 2/5 | 第二轮仅部分命中 | 适合继续观察，不建议直接替代 |
| `MiniMax-M2.5` | 2/5 | 第二轮仅部分命中 | 适合继续观察，不建议直接替代 |

## 验收结果

- 通过
- 验收命令：
  - `rg -n "研究流程入口|研究流程第二步|返回回测研究|历史回测样本构建|研究流程页面，用于策略验证与评分，不直接进入执行链路" backtest.html iteration-manager.html`
  - `sed -n '1403,1420p' backtest.html`
  - `sed -n '1614,1621p' backtest.html`
  - `sed -n '195,243p' iteration-manager.html`

## 边界情况

- 本轮是文案收口，不涉及 JS 逻辑、接口路径、策略配置结构
- `backtest.html` 中仍保留研究流内部跳转与自迭代功能，这些是合理保留项

## 下一步建议

1. `TASK_FLOW_REFACTOR_004`
   - 统一“策略库 / 参数导入 / 策略发布”的命名与入口
2. `TASK_FLOW_REFACTOR_005`
   - 定义执行反馈如何回流到回测与策略管理
