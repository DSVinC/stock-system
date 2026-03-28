# TASK_V5_000 规划对照（执行回写）

> 目的：在**不改动** `TASK_V5_000` 历史规划口径（仍保留 pending）的前提下，给出“规划项 vs 实际落地”的可追溯映射，降低接力丢进度风险。  
> 时间：2026-03-28

---

## 对照总览

| 规划任务 | 规划描述 | 实际落地映射 | 当前结论 | 证据 |
|---|---|---|---|---|
| TASK_V5_001 | 创建策略版本数据库表 | 已具备 `strategy_versions` 与运行链路读写 | 已落地 | `api/strategy-scorer.js`, `api/iteration-manager.js` |
| TASK_V5_002 | 策略评分器 | `quickScore/StrategyScorer` 已用于迭代链路 | 已落地 | `api/strategy-scorer.js` |
| TASK_V5_003 | 自迭代管理页面 | `iteration-manager.html + /api/iteration/*` 已稳定运行 | 已落地 | `iteration-manager.html`, `api/iteration-manager.js` |
| TASK_V5_004 | 评分可视化 | 页面已包含雷达图展示与更新逻辑 | 已落地 | `iteration-manager.html` |
| TASK_V5_005 | 版本对比 | compare API 与页面版本对比已可用 | 已落地 | `api/iteration-manager.js`, `iteration-manager.html` |
| TASK_V5_006 | 回测报告模板 | 结果摘要与版本展示链路已具备 | 部分落地（可继续增强导出模板） | `iteration-manager.html` |
| TASK_V5_007 | Optuna 集成 | 已完成真实评分闭环、optuna 启停、trial 字段沉淀、稳定性回归 | 已落地 | `scripts/optuna_optimizer.py`, `api/iteration-manager.js`, `test/iteration-manager-optuna-*.test.js` |
| TASK_V5_008 | 二次迭代决策逻辑 | 已有基础评分与反馈状态链路，但决策树策略可继续细化 | 部分落地 | `api/iteration-manager.js`, `api/strategy-config.js` |
| TASK_V5_009 | 策略库 4 类策略设计 | 研究发布到策略库与执行流导入链路已打通 | 已落地（可持续扩展策略类型） | `api/strategy-config.js`, `select.html` |
| TASK_V5_010 | 模拟账户验证周期标准 | 规则文档化为主，工程约束可继续强化 | 部分落地 | `docs/tasks/TASK_V5_000.md` |
| TASK_V5_011 | 实盘前检查清单 | 文档层有清单，自动化校验可继续增强 | 部分落地 | `docs/tasks/TASK_V5_000.md` |

---

## 与 FLOW_REFACTOR 映射（关键）

| FLOW_REFACTOR | 对应 V5 规划项 | 说明 |
|---|---|---|
| 019A~024B | V5_003 / V5_004 / V5_005 | 迭代管理页面输入、恢复、结果摘要、终态语义收口 |
| 026A~031D | V5_007 | 真实评分 CLI、Optuna 接入、停机语义、参数归一化、总测收口 |
| 033B~033C | V5_007 | trial 结构化沉淀 + 中等规模稳定性回归 |
| 033D | V5_009 / V5_008 | 研究发布到策略库反馈口径统一，研究→执行闭环增强 |

---

## 使用说明

1. **`TASK_V5_000.md` 仍保留“规划态 pending”**，作为历史规划输入，不直接代表当前真实开发状态。  
2. 日常判断“是否完成”请以：
   - `docs/PROJECT_PROGRESS.md`（总览真源）
   - `docs/runtime/TASK_FLOW_REFACTOR_*_STATUS.md`（任务状态）
   - 测试与代码证据
   为准。  
3. 新增 V5 工作建议继续沿用 `TASK_FLOW_REFACTOR_xxx` 编号体系并在本表追加映射。
