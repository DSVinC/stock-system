# TASK_016 最终整体验收报告

## 验收结论

`TASK_016` 阶段 1-5 本次 **不通过验收**。

原因不是语法或现有测试失败，而是“阶段 5 已完成”的功能闭环不成立：

1. `daily-monitor.mjs` 仍未接入 `after-hours-events.mjs` 和 `feishu-push.mjs`，整条“盘后监控 -> 汇总事件 -> 推送异常事项”的主流程没有打通。
2. `feishu-push.mjs` 当前实现的是 webhook 文本推送，不是需求要求的“飞书私聊推送”。
3. TASK_016 的使用文档没有补齐，现有 `docs/monitor-guide.md` 仍是条件单监控指南，与本任务无关。

因此，虽然脚本语法通过、测试脚本通过、部分 smoke check 通过，但按任务分配文档中的功能验收与文档验收标准，不能判定阶段 1-5 已完成。

---

## 验收范围

- `scripts/daily-monitor.mjs`
- `scripts/feishu-push.mjs`
- `scripts/after-hours-events.mjs`
- `scripts/test-daily-monitor-scenarios.mjs`
- `scripts/test-error-handling.mjs`

---

## 验收环境

- 时间: `2026-03-20 17:18` (Asia/Shanghai)
- 工作目录: `/Users/vvc/.openclaw/workspace/stock-system`
- 执行方式: 本地 Node.js CLI

---

## 执行记录

### 1. 语法检查

执行命令:

```bash
node --check scripts/daily-monitor.mjs
node --check scripts/feishu-push.mjs
node --check scripts/after-hours-events.mjs
node --check scripts/test-daily-monitor-scenarios.mjs
node --check scripts/test-error-handling.mjs
```

结果: `5/5` 通过。

### 2. 测试执行

执行命令:

```bash
node scripts/test-daily-monitor-scenarios.mjs
node scripts/test-error-handling.mjs
```

结果:

- `test-daily-monitor-scenarios.mjs`: `25/25` 通过
- `test-error-handling.mjs`: `24/24` 通过

结论: 指定测试全部通过。

### 3. 补充 smoke check

执行命令:

```bash
node scripts/daily-monitor.mjs
node scripts/after-hours-events.mjs
node scripts/feishu-push.mjs "TASK_016 acceptance smoke test"
```

结果:

- `daily-monitor.mjs`: 运行成功，读取到 `5` 个账户、`1` 个持仓、`0` 个失败股票，并生成 `data/monitor-reports/monitor_report_2026-03-20.json`
- `after-hours-events.mjs`: 运行成功，输出 `14` 条模拟事件
- `feishu-push.mjs`: 运行失败，错误为 `Missing FEISHU_WEBHOOK_URL environment variable`

说明: 当前环境下无法确认真实飞书推送链路可用。

---

## 代码审查发现

### 严重问题

#### 1. 阶段 5 的两个脚本没有接入主监控流程，任务闭环未完成

- `scripts/daily-monitor.mjs` 的主流程只做了“读取账户/持仓 -> 查找报告 -> 生成本地 JSON 报告”，没有导入或调用 `after-hours-events.mjs`，也没有调用 `feishu-push.mjs`，见 `scripts/daily-monitor.mjs:436-539`。
- 这意味着需求文档中“相关事件列表”“推送异常事项”没有进入最终产物，和任务背景、功能需求不一致，见 `docs/tasks/TASK_016_ASSIGNMENT.md:15`, `docs/tasks/TASK_016_ASSIGNMENT.md:35-50`。
- `after-hours-events.mjs` 当前只是独立输出模拟事件，`feishu-push.mjs` 也是独立发送脚本，三者没有形成生产链路。

判定: 这是整体验收不通过的首要原因。

#### 2. 飞书实现不满足“私聊推送”要求

- 需求明确写的是“飞书私聊推送”，见 `docs/tasks/TASK_016_ASSIGNMENT.md:49`。
- `scripts/feishu-push.mjs` 实际使用的是 `FEISHU_WEBHOOK_URL` webhook POST 文本消息，见 `scripts/feishu-push.mjs:28-54`。
- 文件里虽然定义了 `FEISHU_OPEN_ID`，但它只是被拼进消息正文中，并没有参与任何飞书消息 API 的身份路由，见 `scripts/feishu-push.mjs:10`, `scripts/feishu-push.mjs:91-95`, `scripts/feishu-push.mjs:114-118`, `scripts/feishu-push.mjs:137-142`, `scripts/feishu-push.mjs:160-164`。

判定: 当前实现最多可视为“机器人 webhook 推送”，不能证明已经实现“对指定用户私聊发送”。

### 中风险问题

#### 3. 盘后事件源仍是随机 mock 数据，未满足事件抓取验收标准

- `scripts/after-hours-events.mjs` 中四类事件全部由 `Math.random()` 和本地拼接生成，未接入任何真实公告、财报、新闻或行情源，见 `scripts/after-hours-events.mjs:119-245`。
- 任务验收标准要求“能正确抓取相关新闻/事件”，并给出了新浪财经、财报日期等数据源背景，见 `docs/tasks/TASK_016_ASSIGNMENT.md:37-40`, `docs/tasks/TASK_016_ASSIGNMENT.md:83-85`。
- 运行输出中的 `14` 条事件也是模拟结果，不具备真实性、可重复性和可追溯性。

判定: 可作为原型脚手架，但不足以支撑“阶段 5 已完成”的结论。

#### 4. 飞书错误处理仍然会丢失关键响应上下文

- `scripts/feishu-push.mjs` 在每次请求后直接执行 `response.json()`，见 `scripts/feishu-push.mjs:56`。
- 如果飞书或网关返回非 JSON 内容，当前只会落到 `catch` 并记录 JSON 解析异常，无法保留真实 HTTP 状态码和响应体。
- 这会影响生产排障，尤其是 webhook 配置错误、鉴权失败、限流或代理返回 HTML 错页时。

判定: 非阻塞，但应在修复阶段一并处理。

### 轻微问题

#### 5. 报告匹配策略不稳定，后续扩展时容易误匹配旧报告

- `findAnalysisReport` 使用 `files.find()` 做首次匹配，只要文件名包含 `stock_name` 或 `ts_code` 就命中，见 `scripts/daily-monitor.mjs:549-578`。
- 当目录中存在同名股票多份历史报告时，返回哪个文件依赖目录遍历顺序，不具备稳定性。

判定: 当前样本下不阻塞，但影响长期可维护性。

---

## 正向结论

以下部分本次验收确认是成立的:

1. `daily-monitor.mjs` 的核心评估、聚合、HTML 解析和单股失败隔离逻辑可运行，且指定测试全部通过。
2. 两个测试脚本现在直接导入生产函数，不再复制核心实现，测试有效性明显优于早前版本。
3. `after-hours-events.mjs` 作为事件框架原型可正常运行，结构分层也基本清晰。
4. `feishu-push.mjs` 在未配置环境变量时会明确失败返回，而不是静默吞错。

---

## 文档完整性检查

### 不通过

问题如下:

1. `docs/monitor-guide.md` 当前内容是“条件单监控使用指南”，与 TASK_016 的盘后每日监控无关，见 `docs/monitor-guide.md:1-78`。
2. 仓库内没有看到面向 TASK_016 的正式使用文档，未说明:
   - `daily-monitor.mjs` 如何运行
   - `after-hours-events.mjs` 如何接入主流程
   - `feishu-push.mjs` 需要哪些环境变量
   - 定时任务如何配置
   - 失败重试与排障方式
3. `docs/pr/TASK_016_PHASE1_4.md` 仍明确写着“下一步是阶段 5”，见 `docs/pr/TASK_016_PHASE1_4.md:77-83`；而 `docs/runtime/TASK_016_STATUS.md` 又写“第五阶段全部完成”，两处文档口径不一致。

判定: 文档验收标准中的“使用文档已更新”当前不满足。

---

## 验收判定

### 不通过

依据:

1. 虽然语法检查 `5/5` 通过、测试 `49/49` 通过，但这只能证明局部脚本质量，不代表阶段 1-5 的业务闭环完成。
2. 阶段 5 的核心能力没有并入 `daily-monitor.mjs` 主流程。
3. 飞书“私聊推送”需求未实现到位。
4. 事件抓取仍停留在 mock 层。
5. 使用文档未更新且状态文档口径冲突。

---

## 建议整改项

1. 在 `daily-monitor.mjs` 中正式接入事件采集与推送流程，至少形成:
   - 读取持仓
   - 生成评估
   - 汇总事件
   - 生成统一报告
   - 推送结果
2. 将飞书推送改为真正满足“私聊推送”的实现:
   - 若使用用户消息 API，则接入 `tenant_access_token` + `open_id`
   - 若继续使用 webhook，则应回退修改需求文案，不再宣称“私聊”
3. 为 `after-hours-events.mjs` 接入真实数据源，或至少补一个可替换的数据适配层并加测试桩，避免 `Math.random()` 直接进入验收口径。
4. 修复 `feishu-push.mjs` 的响应解析逻辑，保留 HTTP 状态码、响应体和重试上下文。
5. 补齐 TASK_016 专用使用文档，并统一 `docs/pr/`、`docs/runtime/`、`docs/acceptance/` 的阶段状态描述。

---

## 最终结论

本次整体验收结果如下:

- 语法检查: 通过
- 指定测试: 通过
- smoke check: 部分通过
- 代码质量: 存在阶段 5 闭环缺失
- 文档完整性: 不通过
- 综合结果: `TASK_016` 阶段 1-5 **不通过验收**
