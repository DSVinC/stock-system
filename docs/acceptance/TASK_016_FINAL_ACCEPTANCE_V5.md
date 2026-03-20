# TASK_016 每日监控文档验收报告 V5

## 结论

**本次 V5 文档验收未通过。**

提交 `416482d` 已修复 V4 阻断项：

- `docs/guides/TASK_016_MONITOR_GUIDE.md` 的 3.1 JSON 示例已切换到新版 `monitor_assessment` 结构
- `report.parsed_data` 已补充 `decision`、`report_score`、`strategy` 等嵌套字段

但复核发现，文档仍存在多处实现不一致，已经从“字段名错误”转为“字段语义、外围结构、运行示例、排障说明”不一致，仍不满足“文档完整且清晰”的验收标准。

## 验收环境

- 时间：2026-03-20 20:03 (Asia/Shanghai)
- 工作目录：`/Users/vvc/.openclaw/workspace/stock-system`
- 分支：`main`
- 验收提交：`416482dfe3b82e225508ef24122b9aa2d29c7263`
- PR：<https://github.com/DSVinC/stock-system/pull/1>

## 验收范围

- `docs/guides/TASK_016_MONITOR_GUIDE.md`
- `scripts/daily-monitor.mjs`
- `scripts/test-daily-monitor-scenarios.mjs`

## 主要发现

### 1. Blocker: 3.1 JSON 示例的外围结构仍与真实输出不一致

结果：**未通过**

`docs/guides/TASK_016_MONITOR_GUIDE.md` 虽已修正 `monitor_assessment` 内层字段，但示例的外围结构仍和真实输出不一致：

- 文档示例使用 `report_date`，实际输出没有该字段，实际是 `generated_at` + `metadata.market_date`
- 文档示例持仓字段写成 `stock_code`，实际输出字段是 `ts_code`
- 文档示例把 `summary.total_value` 放在账户摘要内，实际 `total_value` 位于账户对象顶层，`summary` 内只有 `action_items`、`high_risk_positions`、`positive_positions`、`negative_positions`、`watch_items_count`、`risk_alerts_count`
- 文档示例遗漏了实际存在的顶层字段：`account_count`、`total_positions`、`failed_stocks`、`report_version`、`metadata`

证据：

- 文档：`docs/guides/TASK_016_MONITOR_GUIDE.md:104-141`
- 实现：`scripts/daily-monitor.mjs:456-469`
- 实现：`scripts/daily-monitor.mjs:480-510`
- 实现：`scripts/daily-monitor.mjs:145-153`

影响：

- 使用者无法根据文档准确构造消费逻辑
- 3.1 示例不再是“近似示意”，而是会误导字段层级与取值位置

### 2. Blocker: `monitor_assessment.action` 的文档语义与实现枚举不一致

结果：**未通过**

文档已把 `action` 字段写入示例，但它的值和说明仍不是实现中的真实取值：

- 文档示例值写成 `"继续跟踪"`
- 字段说明写成“继续跟踪/减仓/清仓等”
- 实际实现输出的是枚举值：`hold`、`buy`、`sell`

证据：

- 文档：`docs/guides/TASK_016_MONITOR_GUIDE.md:112-118`
- 文档：`docs/guides/TASK_016_MONITOR_GUIDE.md:160`
- 实现：`scripts/daily-monitor.mjs:43-58`
- 实现：`scripts/daily-monitor.mjs:169-173`
- 测试：`scripts/test-daily-monitor-scenarios.mjs:316`

影响：

- 文档读者会把 `action` 当作中文文案，而不是稳定枚举
- 下游若按文档实现判断逻辑，会和真实 JSON 输出不兼容

### 3. Major: 运行输出示例仍是旧日志格式

结果：**未通过**

“2.2 运行主流程”的预期输出仍不是当前脚本的实际日志格式。文档写的是旧版方括号日志：

- `[每日监控] 开始执行...`
- `[账户] 读取到 5 个模拟账户`
- `[监控报告] 生成报告文件...`

当前实现实际输出的是另一套日志：

- `📊 每日监控任务启动`
- `📈 找到 X 个模拟账户`
- `📊 开始收集盘后事件...`
- `📨 开始发送飞书推送...`
- `📄 报告已保存: ...`

证据：

- 文档：`docs/guides/TASK_016_MONITOR_GUIDE.md:69-79`
- 实现：`scripts/daily-monitor.mjs:446-454`
- 实现：`scripts/daily-monitor.mjs:543-573`

影响：

- 用户按文档核对运行结果时，会误判脚本执行状态

### 4. Major: 分析报告文件格式说明错误

结果：**未通过**

故障排查章节仍写着分析报告文件名格式为 `stock_analysis_<股票代码>.json`，但实际实现查找的是 `report/analysis/` 下的 `.html` 文件，注释说明格式为 `stock_report_股票名称_日期.html`，同时也允许文件名包含 `ts_code`。

证据：

- 文档：`docs/guides/TASK_016_MONITOR_GUIDE.md:214-220`
- 实现：`scripts/daily-monitor.mjs:593-599`

影响：

- 使用者会把排障方向指向错误的文件格式
- 实际有报告时也可能因为按文档组织文件而匹配失败

## 已确认通过项

### 1. V4 阻断项已修复

结果：**通过**

本次提交确实修正了上一轮指出的核心问题：

- `monitor_assessment` 已改为新版结构：`action`、`risk_level`、`summary`、`follow_ups`、`watch_items`、`risk_alerts`
- `report.parsed_data` 已补充为嵌套结构，包含 `decision`、`report_score`、`strategy`、`key_watch_points`、`risk_controls`

证据：

- 提交：`416482d`
- 文档：`docs/guides/TASK_016_MONITOR_GUIDE.md:112-127`

### 2. 实现与场景测试复核

结果：**通过**

已执行：

```bash
node --check scripts/daily-monitor.mjs
node scripts/test-daily-monitor-scenarios.mjs
```

结果：

- `scripts/daily-monitor.mjs` 语法检查通过
- `scripts/test-daily-monitor-scenarios.mjs`：25/25 通过

## 最终判定

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 3.1 JSON 示例字段名修复 | 通过 | 已改为新版 `monitor_assessment` 并补充 `report.parsed_data` |
| 3.1 JSON 示例外围结构一致性 | 未通过 | 顶层字段、持仓字段、账户摘要结构仍与实现不符 |
| `action` 字段语义一致性 | 未通过 | 文档写成中文动作，实际输出是 `hold/buy/sell` |
| 运行示例一致性 | 未通过 | 预期输出仍是旧日志格式 |
| 排障说明一致性 | 未通过 | 分析报告文件格式仍写错为 `.json` |
| 代码/测试复核 | 通过 | 语法检查通过，场景测试 25/25 通过 |

**结论：TASK_016 本次 V5 文档验收未通过。**

## 重新提交前需修复

1. 更新 3.1 JSON 示例，使顶层、账户层、持仓层与 `scripts/daily-monitor.mjs` 的真实输出完全一致。
2. 明确 `monitor_assessment.action` 的真实枚举值，并将说明从中文动作文案改为 `hold/buy/sell`。
3. 重写“2.2 运行主流程”的预期输出，使其匹配当前控制台日志。
4. 修正“5.3 分析报告匹配失败”的文件格式说明，至少要反映 `.html` 与当前匹配规则。
