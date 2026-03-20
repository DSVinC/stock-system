# TASK_016 盘后监控使用文档

## 1. 功能概述

`TASK_016` 目前由 3 个独立脚本组成，用于盘后监控场景：

- `scripts/daily-monitor.mjs`
  - 读取模拟账户与持仓
  - 尝试匹配个股分析报告
  - 解析报告中的 `decision`、`report_score`、`key_watch_points`、`risk_controls` 等字段
  - 为持仓生成 `monitor_assessment`
  - 为账户生成 `summary`
  - 为整份报告生成 `overview`
  - 输出 JSON 报告到 `data/monitor-reports/`
- `scripts/after-hours-events.mjs`
  - 盘后事件采集框架原型
  - 当前输出公司公告、财报发布、重要新闻、价格异动 4 类模拟事件
  - 目前未接入 `daily-monitor.mjs` 主流程
- `scripts/feishu-push.mjs`
  - 飞书消息推送脚本
  - 当前实现为机器人 webhook 文本推送
  - 目前未由 `daily-monitor.mjs` 自动调用

当前口径必须明确：

- 已落地能力：本地监控报告生成、报告字段解析、基础风险评估、事件原型脚手架、飞书 webhook 推送脚本。
- 未打通能力：`daily-monitor.mjs -> after-hours-events.mjs -> feishu-push.mjs` 的自动闭环。
- 未完成能力：真实事件源接入、飞书私聊 API 路由。

## 2. 运行方式

### 2.1 运行 `daily-monitor.mjs`

用途：生成盘后监控 JSON 报告。

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/daily-monitor.mjs
```

预期结果：

- 控制台打印账户、持仓、失败股票统计
- 生成文件 `data/monitor-reports/monitor_report_YYYY-MM-DD.json`

输出内容重点：

- `accounts[].positions[].monitor_assessment`
- `accounts[].summary`
- `overview`
- `failed_stocks`

依赖：

- 模拟账户数据库可读
- `report/analysis/` 下存在可匹配的 HTML 分析报告时，会自动解析并补充 `report.parsed_data`

### 2.2 运行 `after-hours-events.mjs`

用途：单独验证盘后事件采集框架。

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/after-hours-events.mjs
```

预期结果：

- 控制台打印 4 类事件源的采集结果
- 输出聚合统计和一条事件结构示例

注意：

- 当前事件由脚本内部 mock 生成
- 该脚本不会写入 `daily-monitor` 生成的 JSON 报告

### 2.3 运行 `feishu-push.mjs`

用途：单独发送飞书 webhook 文本消息。

发送纯文本：

```bash
cd /Users/vvc/.openclaw/workspace/stock-system
node scripts/feishu-push.mjs "TASK_016 test message"
```

发送内置测试命令：

```bash
node scripts/feishu-push.mjs monitor-report
node scripts/feishu-push.mjs risk-alert
node scripts/feishu-push.mjs stock-alert
node scripts/feishu-push.mjs daily-summary
```

预期结果：

- 成功时输出 `Message sent successfully`
- 失败时输出 `Failed to send message: ...`

## 3. 环境变量配置

建议在项目根目录通过 `.env` 或 shell 导出方式统一管理。

示例：

```bash
export NODE_ENV=production
export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-token"
export FEISHU_OPEN_ID="ou_xxx"
```

### 3.1 必需变量

#### `FEISHU_WEBHOOK_URL`

- 用途：`scripts/feishu-push.mjs` 的 webhook 推送地址
- 当前状态：必需；未配置时脚本直接失败
- 适用脚本：`feishu-push.mjs`

### 3.2 推荐变量

#### `FEISHU_OPEN_ID`

- 用途：用于标识飞书接收人
- 当前状态：文档层建议保留；现有 `scripts/feishu-push.mjs` 并未从环境变量读取该值，也未用于真实私聊路由
- 适用场景：后续若改造成飞书用户消息 API，需要与 `tenant_access_token` 等鉴权参数配合使用

#### `NODE_ENV`

- 用途：写入 `daily-monitor.mjs` 输出报告中的 `metadata.environment`
- 当前状态：可选；默认值为 `development`

### 3.3 配置检查

执行前可先检查：

```bash
echo "$FEISHU_WEBHOOK_URL"
echo "$FEISHU_OPEN_ID"
echo "$NODE_ENV"
```

如果 `FEISHU_WEBHOOK_URL` 为空，`feishu-push.mjs` 无法发送消息。

## 4. 定时任务配置示例

建议把 3 个脚本拆成独立 cron 任务，避免单个失败影响全部链路。

### 4.1 每个交易日 15:35 生成监控报告

```cron
35 15 * * 1-5 cd /Users/vvc/.openclaw/workspace/stock-system && /usr/bin/env node scripts/daily-monitor.mjs >> logs/task016-daily-monitor.log 2>&1
```

### 4.2 每个交易日 15:40 拉取盘后事件原型

```cron
40 15 * * 1-5 cd /Users/vvc/.openclaw/workspace/stock-system && /usr/bin/env node scripts/after-hours-events.mjs >> logs/task016-after-hours-events.log 2>&1
```

### 4.3 每个交易日 15:45 发送飞书测试消息

```cron
45 15 * * 1-5 cd /Users/vvc/.openclaw/workspace/stock-system && FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-token" /usr/bin/env node scripts/feishu-push.mjs daily-summary >> logs/task016-feishu-push.log 2>&1
```

### 4.4 推荐做法

- 先单独手工跑通 3 个脚本，再写入 cron
- 为每个任务单独输出日志文件
- 目前不要把这 3 个 cron 描述成“完整自动监控闭环”，因为脚本之间仍是松耦合独立运行

## 5. 失败重试与排障指南

### 5.1 `daily-monitor.mjs` 排障

现有行为：

- 单只股票失败不会中断整批任务
- 失败项会记录到 `failed_stocks`
- 整体异常会直接抛出并退出

常见问题与处理：

#### 问题 1：没有生成报告文件

检查：

```bash
node scripts/daily-monitor.mjs
ls -l data/monitor-reports
```

排查方向：

- 数据库读取失败
- 运行目录错误
- `data/monitor-reports/` 无写权限

#### 问题 2：持仓存在，但 `report` 为 `null`

检查：

```bash
ls -l report/analysis
```

排查方向：

- 报告文件名未包含股票名或 `ts_code`
- 目录下没有对应 HTML 报告
- 同名历史报告过多，当前匹配策略命中不稳定

#### 问题 3：`parse_status` 为 `partial_success` 或 `error`

含义：

- `partial_success`：核心字段部分可解析，但数值型字段未完整解析
- `error: ...`：HTML 结构不匹配、文件读取失败或内容格式异常

建议：

- 优先查看原始 HTML 报告格式是否变更
- 检查 `最终决策`、`研究评级`、`关键观察点`、`风险控制` 等块是否仍符合现有模板

### 5.2 `after-hours-events.mjs` 排障

现有行为：

- 事件源逐个采集
- 某个源失败时会打印错误并返回空数组

常见问题与处理：

#### 问题 1：事件数量不稳定

原因：

- 当前脚本使用 mock 数据和 `Math.random()`
- 输出不是生产级稳定结果

结论：

- 这是当前实现特征，不是运行故障
- 如果要做验收或自动对比，请先改造成固定测试桩或真实数据适配层

#### 问题 2：脚本执行失败

检查：

```bash
node --check scripts/after-hours-events.mjs
node scripts/after-hours-events.mjs
```

### 5.3 `feishu-push.mjs` 排障

现有行为：

- 内置最多 `3` 次重试
- 重试间隔按 `1s`、`2s`、`3s` 递增
- 缺少 webhook 时直接返回失败

常见问题与处理：

#### 问题 1：`Missing FEISHU_WEBHOOK_URL environment variable`

处理：

```bash
export FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/your-webhook-token"
node scripts/feishu-push.mjs "ping"
```

#### 问题 2：HTTP 成功但消息未到达

排查方向：

- webhook 地址是否属于正确机器人
- 飞书群机器人是否被禁用
- 安全策略是否限制 IP、关键词或签名

#### 问题 3：返回内容异常，日志信息不足

现状：

- 当前实现直接调用 `response.json()`
- 如果服务端返回非 JSON，错误信息可能不完整

建议：

- 优先通过代理、网关或 webhook 平台日志辅助定位
- 后续代码层建议保留 HTTP 状态码、响应头和原始响应文本

## 6. 推荐执行顺序

手工联调建议按以下顺序执行：

```bash
node scripts/daily-monitor.mjs
node scripts/after-hours-events.mjs
node scripts/feishu-push.mjs "TASK_016 manual smoke check"
```

解释：

- 第一步验证持仓、报告解析和 JSON 产物
- 第二步验证事件脚手架是否可运行
- 第三步验证飞书 webhook 是否可用

这 3 步都通过，只能说明各脚本单独可运行，不代表主流程已经自动打通。

## 7. 输出与日志位置

- 监控报告目录：`data/monitor-reports/`
- 推荐 cron 日志目录：`logs/`
- 关键状态文件：`docs/runtime/TASK_016_STATUS.md`

## 8. 当前限制

- `daily-monitor.mjs` 目前未自动合并盘后事件
- `daily-monitor.mjs` 目前未自动触发飞书推送
- `after-hours-events.mjs` 目前是 mock 事件源
- `feishu-push.mjs` 当前是 webhook 文本推送，不是飞书私聊 API

因此，本文档的目标是说明“当前可运行方式”和“真实限制”，而不是把 TASK_016 描述为已经全部交付完成。
