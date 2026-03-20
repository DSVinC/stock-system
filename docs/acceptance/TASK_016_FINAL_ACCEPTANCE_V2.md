# TASK_016 最终整体验收报告 V2

## 结论

**本次验收未通过。**

本轮复核确认：

- `daily-monitor.mjs` 已接入 `after-hours-events.mjs` 与 `feishu-push.mjs`
- `feishu-push.mjs` 已改为飞书私聊 API，而非 webhook
- TASK_016 相关脚本级测试当前为 100% 通过

但仍存在 2 个阻断项：

1. 使用文档与当前实现严重不一致，仍明确写着“未打通闭环”“当前是 webhook 推送”，不满足“文档完整且清晰”的验收标准。
2. 在仓库当前默认运行方式下，仅有 `.env` 文件并不会自动注入 `process.env`；直接执行 `node scripts/daily-monitor.mjs` 时，飞书推送实际失败，但主流程仍打印“飞书推送发送成功”，会误导使用者。

## 验收环境

- 时间：2026-03-20 18:30 (Asia/Shanghai)
- 工作目录：`/Users/vvc/.openclaw/workspace/stock-system`
- 分支：`test/codex-review-demo`
- PR：<https://github.com/DSVinC/stock-system/pull/1>

## 验收范围

- `scripts/daily-monitor.mjs`
- `scripts/after-hours-events.mjs`
- `scripts/feishu-push.mjs`
- `docs/guides/TASK_016_MONITOR_GUIDE.md`

## 验收结果

### 1. 语法检查

结果：**通过**

执行：

```bash
node --check scripts/daily-monitor.mjs
node --check scripts/after-hours-events.mjs
node --check scripts/feishu-push.mjs
```

结论：3/3 通过。

### 2. 功能闭环

结果：**部分通过**

静态检查确认 `daily-monitor.mjs` 已导入并调用：

- `collectAfterHoursEvents()`，见 `scripts/daily-monitor.mjs:4-5`、`scripts/daily-monitor.mjs:538-555`
- `sendMonitorReport()`，见 `scripts/daily-monitor.mjs:4-5`、`scripts/daily-monitor.mjs:552-559`

运行 `node scripts/daily-monitor.mjs` 时，已生成带 `after_hours_events` 的监控报告文件：

- `data/monitor-reports/monitor_report_2026-03-20.json`

但主流程存在两个实现缺陷：

- 飞书推送失败时，`sendMonitorReport()` 仅返回 `{ success: false }`，不抛异常；`daily-monitor.mjs` 仍无条件打印“✅ 飞书推送发送成功”，见 `scripts/daily-monitor.mjs:553-556`
- `after-hours-events.mjs` 在模块顶层无条件执行 `main()`，被 `daily-monitor.mjs` 导入时会先自动跑一遍采集，再由 `collectAfterHoursEvents()` 再跑一遍，存在导入副作用，见 `scripts/after-hours-events.mjs:410-414`、`scripts/after-hours-events.mjs:422-432`

### 3. 飞书推送实现

结果：**实现通过，默认运行体验未通过**

静态检查确认当前实现使用飞书私聊 API：

- token 获取：`/open-apis/auth/v3/app_access_token/internal`
- 发消息接口：`/open-apis/im/v1/messages?receive_id_type=open_id`
- 证据：`scripts/feishu-push.mjs:27-52`、`scripts/feishu-push.mjs:61-111`

未发现 webhook 调用。

但当前仓库默认运行方式下存在可用性问题：

- `.env` 文件存在，不代表 Node 会自动加载环境变量
- 直接执行 `node scripts/daily-monitor.mjs` 时，实际输出为：

```text
[飞书私聊推送失败] 监控报告: Failed after 3 attempts: Missing FEISHU_APP_ID or FEISHU_APP_SECRET environment variable
✅ 飞书推送发送成功
```

这说明：

- 默认执行路径并不能仅依赖“.env 文件已创建”
- 主流程日志对推送结果的呈现是错误的

在显式 `source .env` 后，脚本能读取变量，但由于当前验收沙箱禁止外网请求，无法完成真实飞书发送；该点无法在本会话中独立复核成功回执。

### 4. 文档完整性

结果：**未通过**

`docs/guides/TASK_016_MONITOR_GUIDE.md` 当前内容仍是旧口径，和代码现状冲突：

- 写明 `after-hours-events.mjs` “目前未接入 `daily-monitor.mjs` 主流程”，见 `docs/guides/TASK_016_MONITOR_GUIDE.md:15-18`
- 写明 `feishu-push.mjs` “当前实现为机器人 webhook 文本推送”，见 `docs/guides/TASK_016_MONITOR_GUIDE.md:19-22`
- 写明“未打通能力：`daily-monitor.mjs -> after-hours-events.mjs -> feishu-push.mjs` 的自动闭环”，见 `docs/guides/TASK_016_MONITOR_GUIDE.md:24-28`
- 写明 `daily-monitor.mjs` “目前未自动触发飞书推送”，见 `docs/guides/TASK_016_MONITOR_GUIDE.md:321-326`

该文档不能作为当前版本的清晰使用指南，因此不满足验收标准 4。

### 5. 测试结果

结果：**TASK_016 专项脚本通过；系统级联调未在本会话中通过**

已执行并通过：

```bash
node scripts/test-daily-monitor-scenarios.mjs
node scripts/test-error-handling.mjs
```

结果：

- `scripts/test-daily-monitor-scenarios.mjs`：25/25 通过，100%
- `scripts/test-error-handling.mjs`：24/24 通过，100%

未能在本会话中完成的系统级测试：

```bash
bash test/acceptance-test.sh
bash test/integration-test.sh
```

失败原因是当前沙箱不允许本地进程监听 `127.0.0.1:3000`，启动 `api/server.js` 时返回：

```text
Error: listen EPERM: operation not permitted 127.0.0.1:3000
```

因此，两套 shell 联调脚本在本验收会话里无法被独立复核为“100% 通过”。这部分不能写成已确认通过。

## 阻断项

### Blocker 1: 使用文档未更新到当前实现

影响：

- 使用者会被文档误导，认为功能尚未闭环或仍是 webhook 方案
- 不满足“文档完整：有清晰的使用指南”

涉及文件：

- `docs/guides/TASK_016_MONITOR_GUIDE.md`

### Blocker 2: 默认执行路径下飞书推送不可用且成功日志错误

影响：

- 仅创建 `.env` 文件不足以让脚本读取飞书配置
- 推送失败时主流程仍输出成功，导致误判运行状态

涉及文件：

- `scripts/daily-monitor.mjs`
- `scripts/feishu-push.mjs`

## 非阻断风险

### Risk 1: `after-hours-events.mjs` 有导入副作用

导入模块时会自动执行一次 `main()`，再调用导出函数时又执行一次采集。当前已可稳定复现双次采集日志。

涉及文件：

- `scripts/after-hours-events.mjs`

### Risk 2: 现有旧版验收文档曾记录敏感配置

本次已重写本报告并去除敏感值。后续应检查历史文档和提交记录中是否还有明文凭据。

## 最终判定

| 验收项 | 结果 | 说明 |
| --- | --- | --- |
| 语法检查 | 通过 | 3/3 通过 |
| 功能闭环 | 部分通过 | 调用链存在，但推送结果处理有缺陷 |
| 飞书推送 | 部分通过 | 私聊 API 已实现，但默认执行路径不可直接工作 |
| 文档完整 | 未通过 | 文档仍是旧口径 |
| 测试通过 | 未完全确认 | TASK_016 专项脚本 100% 通过；系统级联调受沙箱限制未独立复核 |

**结论：TASK_016 本次最终整体验收不通过。**

## 重新验收前置条件

1. 更新 `docs/guides/TASK_016_MONITOR_GUIDE.md`，使其与当前实现一致。
2. 修正 `daily-monitor.mjs` 的飞书推送结果处理。
3. 明确 `.env` 的加载方式。
   例如：启动脚本显式 `source .env`，或在 Node 侧显式加载环境文件。
4. 去掉 `after-hours-events.mjs` 的导入副作用。
5. 在允许监听本地端口和外网访问的环境中重新执行：

```bash
node scripts/test-daily-monitor-scenarios.mjs
node scripts/test-error-handling.mjs
bash test/acceptance-test.sh
bash test/integration-test.sh
```
